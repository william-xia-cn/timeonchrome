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
            CREATE TABLE IF NOT EXISTS browser_shadow_dirty_ranges_v2(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              local_user_id TEXT NOT NULL,
              from_ms INTEGER NOT NULL,
              to_ms INTEGER NOT NULL,
              created_at_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_browser_shadow_dirty_user_v2
              ON browser_shadow_dirty_ranges_v2(local_user_id,from_ms,to_ms);
            CREATE TABLE IF NOT EXISTS browser_bridge_health_v2(
              local_user_id TEXT PRIMARY KEY,
              protocol_version INTEGER NOT NULL,
              last_heartbeat_at_ms INTEGER NOT NULL DEFAULT 0,
              last_probe_at_ms INTEGER NOT NULL DEFAULT 0,
              last_ledger_ack_at_ms INTEGER NOT NULL DEFAULT 0,
              pending_send_count INTEGER NOT NULL DEFAULT 0,
              accepted_count INTEGER NOT NULL DEFAULT 0,
              duplicate_count INTEGER NOT NULL DEFAULT 0,
              rejected_count INTEGER NOT NULL DEFAULT 0,
              last_error_code TEXT
            );
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

        var result = await AppendV2Async(sessionId, localUserId, profileId, extensionId, segments,
            receivedAtMs, BrowserBridgeProtocol.Version, cancellationToken).ConfigureAwait(false);
        return result.AcceptedIds.Count;
    }

    public async Task<BrowserBridgeAppendResult> AppendV2Async(
        int sessionId,
        string localUserId,
        string profileId,
        string extensionId,
        IReadOnlyList<BrowserSettledUsageSegment> segments,
        long receivedAtMs,
        int protocolVersion = BrowserBridgeProtocol.CurrentVersion,
        CancellationToken cancellationToken = default)
    {
        if (sessionId < 0) throw new ArgumentOutOfRangeException(nameof(sessionId));
        ArgumentException.ThrowIfNullOrWhiteSpace(localUserId);
        if (!Guid.TryParse(profileId, out _)) throw new InvalidDataException("Browser profile ID is invalid.");
        if (segments.Count > 100) throw new InvalidDataException("Browser segment batch is too large.");

        var acceptedIds = new List<string>();
        var duplicateIds = new List<string>();
        var rejected = new List<BrowserBridgeRejectedSegment>();
        var valid = new List<BrowserSettledUsageSegment>();
        var insertedSegments = new List<BrowserSettledUsageSegment>();
        foreach (var segment in segments)
        {
            try
            {
                Validate(segment);
                valid.Add(segment);
            }
            catch (InvalidDataException)
            {
                rejected.Add(new BrowserBridgeRejectedSegment(
                    string.IsNullOrWhiteSpace(segment.SegmentId) ? "invalid" : segment.SegmentId[..Math.Min(160, segment.SegmentId.Length)],
                    "SEGMENT_INVALID", false));
            }
        }

        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);
        foreach (var segment in valid)
        {
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
            var inserted = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            if (inserted == 1)
            {
                acceptedIds.Add(segment.SegmentId);
                insertedSegments.Add(segment);
            }
            else
            {
                duplicateIds.Add(segment.SegmentId);
            }
        }
        if (insertedSegments.Count > 0)
        {
            await using var dirty = connection.CreateCommand();
            dirty.Transaction = (SqliteTransaction)transaction;
            dirty.CommandText = "INSERT INTO browser_shadow_dirty_ranges_v2(local_user_id,from_ms,to_ms,created_at_ms) VALUES($user,$from,$to,$created);";
            dirty.Parameters.AddWithValue("$user", localUserId);
            dirty.Parameters.AddWithValue("$from", insertedSegments.Min(item => item.StartMs));
            dirty.Parameters.AddWithValue("$to", insertedSegments.Max(item => item.EndMs));
            dirty.Parameters.AddWithValue("$created", receivedAtMs);
            await dirty.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await using (var health = connection.CreateCommand())
        {
            health.Transaction = (SqliteTransaction)transaction;
            health.CommandText = """
                INSERT INTO browser_bridge_health_v2(local_user_id,protocol_version,last_ledger_ack_at_ms,
                  accepted_count,duplicate_count,rejected_count,last_error_code)
                VALUES($user,$protocol,$received,$accepted,$duplicate,$rejected,$error)
                ON CONFLICT(local_user_id) DO UPDATE SET
                  protocol_version=excluded.protocol_version,last_ledger_ack_at_ms=excluded.last_ledger_ack_at_ms,
                  accepted_count=accepted_count+excluded.accepted_count,
                  duplicate_count=duplicate_count+excluded.duplicate_count,
                  rejected_count=rejected_count+excluded.rejected_count,
                  last_error_code=excluded.last_error_code;
                """;
            health.Parameters.AddWithValue("$user", localUserId);
            health.Parameters.AddWithValue("$protocol", protocolVersion);
            health.Parameters.AddWithValue("$received", receivedAtMs);
            health.Parameters.AddWithValue("$accepted", acceptedIds.Count);
            health.Parameters.AddWithValue("$duplicate", duplicateIds.Count);
            health.Parameters.AddWithValue("$rejected", rejected.Count);
            health.Parameters.AddWithValue("$error", rejected.Count > 0 ? "SEGMENT_REJECTED" : DBNull.Value);
            await health.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return new BrowserBridgeAppendResult(acceptedIds, duplicateIds, rejected);
    }

    public async Task RecordHealthAsync(
        string localUserId,
        int protocolVersion,
        string messageType,
        long receivedAtMs,
        int pendingSendCount = 0,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(localUserId);
        if (messageType is not ("heartbeat" or "probe")) throw new InvalidDataException("Health type is invalid.");
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        var column = messageType == "probe" ? "last_probe_at_ms" : "last_heartbeat_at_ms";
        command.CommandText = $"""
            INSERT INTO browser_bridge_health_v2(local_user_id,protocol_version,{column},pending_send_count)
            VALUES($user,$protocol,$received,$pending)
            ON CONFLICT(local_user_id) DO UPDATE SET protocol_version=excluded.protocol_version,
              {column}=excluded.{column},pending_send_count=excluded.pending_send_count,last_error_code=NULL;
            """;
        command.Parameters.AddWithValue("$user", localUserId);
        command.Parameters.AddWithValue("$protocol", protocolVersion);
        command.Parameters.AddWithValue("$received", receivedAtMs);
        command.Parameters.AddWithValue("$pending", Math.Max(0, pendingSendCount));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<BrowserBridgeHealthSummary> HealthSummaryAsync(
        bool includeAdministrativeCounts,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT COALESCE(MAX(protocol_version),0),COALESCE(MAX(last_heartbeat_at_ms),0),
              COALESCE(MAX(last_probe_at_ms),0),COALESCE(MAX(last_ledger_ack_at_ms),0),COALESCE(SUM(pending_send_count),0),
              COALESCE(SUM(accepted_count),0),COALESCE(SUM(duplicate_count),0),
              COALESCE(SUM(rejected_count),0),MAX(last_error_code)
            FROM browser_bridge_health_v2;
            """;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        await reader.ReadAsync(cancellationToken).ConfigureAwait(false);
        var pending = includeAdministrativeCounts ? await PendingProjectionCountAsync(cancellationToken).ConfigureAwait(false) : 0;
        return new BrowserBridgeHealthSummary(
            reader.GetInt32(0), reader.GetInt64(1), reader.GetInt64(2), reader.GetInt64(3),
            includeAdministrativeCounts ? reader.GetInt32(4) : 0, pending,
            includeAdministrativeCounts ? reader.GetInt64(5) : 0,
            includeAdministrativeCounts ? reader.GetInt64(6) : 0,
            includeAdministrativeCounts ? reader.GetInt64(7) : 0,
            reader.IsDBNull(8) ? null : reader.GetString(8));
    }

    public async Task<int> PendingProjectionCountAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM browser_shadow_dirty_ranges_v2;";
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false));
    }

    public async Task<bool> ProcessNextDirtyRangeAsync(CancellationToken cancellationToken = default)
    {
        string? user = null;
        long from = 0;
        long to = 0;
        var selectedIds = new List<long>();
        await using (var connection = new SqliteConnection(connectionString))
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
            await using (var userCommand = connection.CreateCommand())
            {
                userCommand.CommandText = "SELECT local_user_id FROM browser_shadow_dirty_ranges_v2 ORDER BY created_at_ms,id LIMIT 1;";
                user = Convert.ToString(await userCommand.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false));
            }
            if (string.IsNullOrWhiteSpace(user)) return false;
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT id,from_ms,to_ms
                FROM browser_shadow_dirty_ranges_v2
                WHERE local_user_id=$user
                ORDER BY from_ms,to_ms,id;
                """;
            command.Parameters.AddWithValue("$user", user);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                var candidateFrom = reader.GetInt64(1);
                var candidateTo = reader.GetInt64(2);
                if (selectedIds.Count == 0)
                {
                    from = candidateFrom;
                    to = candidateTo;
                    selectedIds.Add(reader.GetInt64(0));
                }
                else if (candidateFrom <= to)
                {
                    to = Math.Max(to, candidateTo);
                    selectedIds.Add(reader.GetInt64(0));
                }
                else
                {
                    break;
                }
            }
        }
        await RebuildShadowAsync(user!, from, to, cancellationToken).ConfigureAwait(false);
        await using (var connection = new SqliteConnection(connectionString))
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
            await using var command = connection.CreateCommand();
            var parameters = selectedIds.Select((_, index) => $"$id{index}").ToArray();
            command.CommandText = $"DELETE FROM browser_shadow_dirty_ranges_v2 WHERE id IN ({string.Join(',', parameters)});";
            for (var index = 0; index < selectedIds.Count; index++)
                command.Parameters.AddWithValue(parameters[index], selectedIds[index]);
            await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        return true;
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
