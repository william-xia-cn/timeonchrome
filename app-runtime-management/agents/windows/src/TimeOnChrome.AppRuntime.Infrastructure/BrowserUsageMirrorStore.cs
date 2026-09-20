using Microsoft.Data.Sqlite;
using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed class BrowserUsageMirrorStore
{
    private readonly string connectionString;

    public BrowserUsageMirrorStore(string databasePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(databasePath);
        connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = Path.GetFullPath(databasePath),
            Pooling = false,
        }.ToString();
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS browser_usage_mirror_v1(
              session_id INTEGER NOT NULL,
              local_user_id TEXT NOT NULL,
              profile_id TEXT NOT NULL,
              extension_id TEXT NOT NULL,
              segment_id TEXT NOT NULL,
              start_ms INTEGER NOT NULL,
              end_ms INTEGER NOT NULL,
              duration_ms INTEGER NOT NULL,
              channel TEXT NOT NULL,
              source_state TEXT NOT NULL,
              quota_bucket TEXT,
              mode TEXT,
              estimated INTEGER NOT NULL,
              diagnostic INTEGER NOT NULL,
              received_at_ms INTEGER NOT NULL,
              PRIMARY KEY(session_id, profile_id, segment_id)
            );
            CREATE INDEX IF NOT EXISTS idx_browser_usage_mirror_time_v1
              ON browser_usage_mirror_v1(local_user_id, start_ms, end_ms);
            CREATE TABLE IF NOT EXISTS shared_quota_shadow_v1(
              local_user_id TEXT NOT NULL,
              start_ms INTEGER NOT NULL,
              end_ms INTEGER NOT NULL,
              source TEXT NOT NULL,
              source_segment_id TEXT NOT NULL,
              quota_bucket TEXT NOT NULL,
              application_id TEXT,
              projected_at_ms INTEGER NOT NULL,
              PRIMARY KEY(local_user_id,start_ms,end_ms,source,source_segment_id)
            );
            CREATE INDEX IF NOT EXISTS idx_shared_quota_shadow_time_v1
              ON shared_quota_shadow_v1(local_user_id,start_ms,end_ms);
            """;
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<int> AppendAsync(
        int sessionId,
        string localUserId,
        string profileId,
        string extensionId,
        IReadOnlyList<BrowserSettledUsageSegment> segments,
        long receivedAtMs,
        CancellationToken cancellationToken = default)
    {
        if (sessionId < 0) throw new ArgumentOutOfRangeException(nameof(sessionId));
        ArgumentException.ThrowIfNullOrWhiteSpace(localUserId);
        if (!Guid.TryParse(profileId, out _)) throw new InvalidDataException("Browser profile ID is invalid.");
        if (segments.Count > 100) throw new InvalidDataException("Browser segment batch is too large.");

        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);
        var accepted = 0;
        foreach (var segment in segments)
        {
            Validate(segment);
            await using var command = connection.CreateCommand();
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = """
                INSERT OR IGNORE INTO browser_usage_mirror_v1(
                  session_id,local_user_id,profile_id,extension_id,segment_id,start_ms,end_ms,duration_ms,
                  channel,source_state,quota_bucket,mode,estimated,diagnostic,received_at_ms)
                VALUES($session,$user,$profile,$extension,$segment,$start,$end,$duration,
                  $channel,$state,$bucket,$mode,$estimated,$diagnostic,$received);
                """;
            command.Parameters.AddWithValue("$session", sessionId);
            command.Parameters.AddWithValue("$user", localUserId);
            command.Parameters.AddWithValue("$profile", profileId);
            command.Parameters.AddWithValue("$extension", extensionId);
            command.Parameters.AddWithValue("$segment", segment.SegmentId);
            command.Parameters.AddWithValue("$start", segment.StartMs);
            command.Parameters.AddWithValue("$end", segment.EndMs);
            command.Parameters.AddWithValue("$duration", segment.DurationMs);
            command.Parameters.AddWithValue("$channel", segment.Channel);
            command.Parameters.AddWithValue("$state", segment.SourceState);
            command.Parameters.AddWithValue("$bucket", (object?)segment.QuotaBucket ?? DBNull.Value);
            command.Parameters.AddWithValue("$mode", (object?)segment.Mode ?? DBNull.Value);
            command.Parameters.AddWithValue("$estimated", segment.Estimated ? 1 : 0);
            command.Parameters.AddWithValue("$diagnostic", segment.Diagnostic ? 1 : 0);
            command.Parameters.AddWithValue("$received", receivedAtMs);
            accepted += await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return accepted;
    }

    public async Task<int> CountAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM browser_usage_mirror_v1;";
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false));
    }

    public async Task<IReadOnlyList<SharedQuotaShadowSlice>> RebuildShadowAsync(
        string localUserId,
        long fromMs,
        long toMs,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(localUserId);
        if (fromMs < 0 || toMs <= fromMs) return [];
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);

        var applications = new List<SharedQuotaApplicationInterval>();
        await using (var exists = connection.CreateCommand())
        {
            exists.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='machine_usage_segments_v2';";
            var hasApplicationLedger = Convert.ToInt32(await exists.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false)) > 0;
            if (hasApplicationLedger)
            {
                await using var appCommand = connection.CreateCommand();
                appCommand.CommandText = """
                    SELECT payload_json FROM machine_usage_segments_v2
                    WHERE local_user_id=$user AND json_extract(payload_json,'$.startWallTimeMs') < $to
                      AND json_extract(payload_json,'$.endWallTimeMs') > $from;
                    """;
                appCommand.Parameters.AddWithValue("$user", localUserId);
                appCommand.Parameters.AddWithValue("$from", fromMs);
                appCommand.Parameters.AddWithValue("$to", toMs);
                await using var reader = await appCommand.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
                while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
                {
                    var segment = JsonSerializer.Deserialize<UsageSegmentV2>(reader.GetString(0), RuntimeJson.Options);
                    if (segment?.Application is null || segment.Diagnostic || segment.Channel != UsageChannel.Active) continue;
                    var displayName = segment.Application.DisplayName?.Trim();
                    var isBrowser = string.Equals(displayName, "chrome", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(displayName, "Google Chrome", StringComparison.OrdinalIgnoreCase);
                    applications.Add(new SharedQuotaApplicationInterval(
                        segment.Id, segment.StartWallTimeMs, segment.EndWallTimeMs,
                        segment.Application.RuntimeIdentity, segment.PolicySnapshot?.QuotaBucket,
                        isBrowser));
                }
            }
        }

        var browser = new List<SharedQuotaBrowserInterval>();
        await using (var browserCommand = connection.CreateCommand())
        {
            browserCommand.CommandText = """
                SELECT segment_id,start_ms,end_ms,quota_bucket,channel,diagnostic
                FROM browser_usage_mirror_v1
                WHERE local_user_id=$user AND start_ms < $to AND end_ms > $from;
                """;
            browserCommand.Parameters.AddWithValue("$user", localUserId);
            browserCommand.Parameters.AddWithValue("$from", fromMs);
            browserCommand.Parameters.AddWithValue("$to", toMs);
            await using var reader = await browserCommand.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                browser.Add(new SharedQuotaBrowserInterval(
                    reader.GetString(0), reader.GetInt64(1), reader.GetInt64(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4), reader.GetInt64(5) != 0));
            }
        }

        var projected = SharedQuotaShadowProjector.Project(applications, browser);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);
        await using (var delete = connection.CreateCommand())
        {
            delete.Transaction = (SqliteTransaction)transaction;
            delete.CommandText = "DELETE FROM shared_quota_shadow_v1 WHERE local_user_id=$user AND start_ms < $to AND end_ms > $from;";
            delete.Parameters.AddWithValue("$user", localUserId);
            delete.Parameters.AddWithValue("$from", fromMs);
            delete.Parameters.AddWithValue("$to", toMs);
            await delete.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        var projectedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var slice in projected)
        {
            await using var insert = connection.CreateCommand();
            insert.Transaction = (SqliteTransaction)transaction;
            insert.CommandText = """
                INSERT INTO shared_quota_shadow_v1(local_user_id,start_ms,end_ms,source,source_segment_id,
                  quota_bucket,application_id,projected_at_ms)
                VALUES($user,$start,$end,$source,$segment,$bucket,$application,$projected);
                """;
            insert.Parameters.AddWithValue("$user", localUserId);
            insert.Parameters.AddWithValue("$start", slice.StartMs);
            insert.Parameters.AddWithValue("$end", slice.EndMs);
            insert.Parameters.AddWithValue("$source", slice.Source.ToString().ToLowerInvariant());
            insert.Parameters.AddWithValue("$segment", slice.SegmentId);
            insert.Parameters.AddWithValue("$bucket", slice.QuotaBucket);
            insert.Parameters.AddWithValue("$application", (object?)slice.ApplicationId ?? DBNull.Value);
            insert.Parameters.AddWithValue("$projected", projectedAt);
            await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return projected;
    }

    private static void Validate(BrowserSettledUsageSegment segment)
    {
        if (string.IsNullOrWhiteSpace(segment.SegmentId) || segment.SegmentId.Length > 160)
            throw new InvalidDataException("Browser segment ID is invalid.");
        if (segment.StartMs < 0 || segment.EndMs < segment.StartMs || segment.DurationMs < 0
            || segment.DurationMs > segment.EndMs - segment.StartMs)
            throw new InvalidDataException("Browser segment timing is invalid.");
        if (segment.Channel is not ("active" or "backgroundMedia" or "pip" or "diagnostic"))
            throw new InvalidDataException("Browser segment channel is invalid.");
        if (string.IsNullOrWhiteSpace(segment.SourceState) || segment.SourceState.Length > 64
            || segment.QuotaBucket?.Length > 64 || segment.Mode?.Length > 64)
            throw new InvalidDataException("Browser segment metadata is too long.");
    }
}
