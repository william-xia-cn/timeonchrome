using Microsoft.Data.Sqlite;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed class SqliteSegmentStore : ISegmentStore, IUploadOutbox
{
    private readonly string connectionString;
    private readonly string? boundDeviceId;

    public SqliteSegmentStore(string databasePath, string? boundDeviceId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(databasePath);
        var directory = Path.GetDirectoryName(Path.GetFullPath(databasePath));
        if (directory is not null)
        {
            Directory.CreateDirectory(directory);
        }

        connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
        }.ToString();
        this.boundDeviceId = boundDeviceId;
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;

            CREATE TABLE IF NOT EXISTS runtime_segments (
              id TEXT PRIMARY KEY NOT NULL,
              runtime_session_id TEXT NOT NULL,
              platform TEXT NOT NULL,
              runtime_identity TEXT NOT NULL,
              display_name TEXT,
              start_at_ms INTEGER NOT NULL,
              end_at_ms INTEGER NOT NULL,
              duration_ms INTEGER NOT NULL,
              end_reason TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              created_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS runtime_outbox (
              segment_id TEXT PRIMARY KEY NOT NULL REFERENCES runtime_segments(id),
              attempt_count INTEGER NOT NULL DEFAULT 0,
              next_attempt_at_ms INTEGER,
              last_error_code TEXT,
              terminal INTEGER NOT NULL DEFAULT 0,
              created_at_ms INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS runtime_outbox_pending_idx
              ON runtime_outbox(terminal, next_attempt_at_ms, created_at_ms);

            CREATE TABLE IF NOT EXISTS runtime_metadata (
              key TEXT PRIMARY KEY NOT NULL,
              value TEXT NOT NULL
            );
            """;
        _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        if (boundDeviceId is not null)
        {
            await using var bind = connection.CreateCommand();
            bind.CommandText = "INSERT INTO runtime_metadata(key,value) VALUES('bound_device_id',?1) ON CONFLICT(key) DO NOTHING;";
            _ = bind.Parameters.AddWithValue("?1", boundDeviceId);
            _ = await bind.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            await using var verify = connection.CreateCommand();
            verify.CommandText = "SELECT value FROM runtime_metadata WHERE key='bound_device_id';";
            var actual = (string?)await verify.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            if (!string.Equals(actual, boundDeviceId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Runtime database belongs to another device.");
            }
        }
    }

    public async Task PersistAndEnqueueAsync(
        IReadOnlyList<UsageSegment> segments,
        CancellationToken cancellationToken = default)
    {
        if (segments.Count == 0)
        {
            return;
        }

        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = connection.BeginTransaction(deferred: false);
        var createdAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        foreach (var segment in segments)
        {
            ValidateSegment(segment);
            var contentHash = SegmentCanonicalizer.ContentHash(segment);
            var inserted = await InsertSegmentAsync(
                connection,
                transaction,
                segment,
                contentHash,
                createdAtMs,
                cancellationToken).ConfigureAwait(false);
            if (!inserted)
            {
                var existingHash = await ExistingHashAsync(
                    connection,
                    transaction,
                    segment.Id,
                    cancellationToken).ConfigureAwait(false);
                if (!string.Equals(existingHash, contentHash, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException($"Segment ID conflict: {segment.Id}.");
                }
            }

            await using var outbox = connection.CreateCommand();
            outbox.Transaction = transaction;
            outbox.CommandText = """
                INSERT OR IGNORE INTO runtime_outbox(
                  segment_id, attempt_count, next_attempt_at_ms,
                  last_error_code, terminal, created_at_ms
                ) VALUES (?1, 0, NULL, NULL, 0, ?2);
                """;
            _ = outbox.Parameters.AddWithValue("?1", segment.Id);
            _ = outbox.Parameters.AddWithValue("?2", createdAtMs);
            _ = await outbox.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<UsageSegment?> SegmentAsync(
        string id,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, runtime_session_id, platform, runtime_identity, display_name,
                   start_at_ms, end_at_ms, duration_ms, end_reason
            FROM runtime_segments WHERE id = ?1;
            """;
        _ = command.Parameters.AddWithValue("?1", id);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? ReadSegment(reader)
            : null;
    }

    public async Task<IReadOnlyList<UploadOutboxEntry>> PendingAsync(
        int limit,
        long nowMs,
        CancellationToken cancellationToken = default)
    {
        if (limit is < 1 or > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(limit));
        }

        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT segment_id, attempt_count, next_attempt_at_ms, last_error_code
            FROM runtime_outbox
            WHERE terminal = 0 AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?1)
            ORDER BY created_at_ms, segment_id
            LIMIT ?2;
            """;
        _ = command.Parameters.AddWithValue("?1", nowMs);
        _ = command.Parameters.AddWithValue("?2", limit);

        var entries = new List<UploadOutboxEntry>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            entries.Add(new UploadOutboxEntry(
                reader.GetString(0),
                reader.GetInt32(1),
                reader.IsDBNull(2) ? null : reader.GetInt64(2),
                reader.IsDBNull(3) ? null : reader.GetString(3)));
        }

        return entries;
    }

    public Task MarkAcceptedAsync(
        IReadOnlySet<string> segmentIDs,
        CancellationToken cancellationToken = default) =>
        UpdateManyAsync(
            segmentIDs,
            "DELETE FROM runtime_outbox WHERE segment_id = ?1;",
            errorCode: null,
            retryAtMs: null,
            cancellationToken);

    public Task RecordFailureAsync(
        IReadOnlySet<string> segmentIDs,
        string errorCode,
        long retryAtMs,
        CancellationToken cancellationToken = default) =>
        UpdateManyAsync(
            segmentIDs,
            """
            UPDATE runtime_outbox
            SET attempt_count = attempt_count + 1,
                next_attempt_at_ms = ?2,
                last_error_code = ?3
            WHERE segment_id = ?1 AND terminal = 0;
            """,
            errorCode,
            retryAtMs,
            cancellationToken);

    public Task RecordPermanentRejectionAsync(
        IReadOnlySet<string> segmentIDs,
        string errorCode,
        CancellationToken cancellationToken = default) =>
        UpdateManyAsync(
            segmentIDs,
            """
            UPDATE runtime_outbox
            SET attempt_count = attempt_count + 1,
                next_attempt_at_ms = NULL,
                last_error_code = ?3,
                terminal = 1
            WHERE segment_id = ?1;
            """,
            errorCode,
            retryAtMs: null,
            cancellationToken);

    public async Task<int> OutboxCountAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM runtime_outbox;";
        return Convert.ToInt32(
            await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false),
            System.Globalization.CultureInfo.InvariantCulture);
    }

    private async Task<SqliteConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;";
        _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        return connection;
    }

    private static async Task<bool> InsertSegmentAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        UsageSegment segment,
        string contentHash,
        long createdAtMs,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT OR IGNORE INTO runtime_segments(
              id, runtime_session_id, platform, runtime_identity, display_name,
              start_at_ms, end_at_ms, duration_ms, end_reason, content_hash, created_at_ms
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);
            """;
        _ = command.Parameters.AddWithValue("?1", segment.Id);
        _ = command.Parameters.AddWithValue("?2", segment.RuntimeSessionID);
        _ = command.Parameters.AddWithValue("?3", WireName(segment.Application.Platform));
        _ = command.Parameters.AddWithValue("?4", segment.Application.RuntimeIdentity);
        _ = command.Parameters.AddWithValue("?5", (object?)segment.Application.DisplayName ?? DBNull.Value);
        _ = command.Parameters.AddWithValue("?6", segment.StartAtMs);
        _ = command.Parameters.AddWithValue("?7", segment.EndAtMs);
        _ = command.Parameters.AddWithValue("?8", segment.DurationMilliseconds);
        _ = command.Parameters.AddWithValue("?9", WireName(segment.EndReason));
        _ = command.Parameters.AddWithValue("?10", contentHash);
        _ = command.Parameters.AddWithValue("?11", createdAtMs);
        return await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false) == 1;
    }

    private static async Task<string?> ExistingHashAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string id,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT content_hash FROM runtime_segments WHERE id = ?1;";
        _ = command.Parameters.AddWithValue("?1", id);
        return (string?)await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task UpdateManyAsync(
        IReadOnlySet<string> segmentIDs,
        string sql,
        string? errorCode,
        long? retryAtMs,
        CancellationToken cancellationToken)
    {
        if (segmentIDs.Count == 0)
        {
            return;
        }

        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = connection.BeginTransaction(deferred: false);
        foreach (var id in segmentIDs)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = sql;
            _ = command.Parameters.AddWithValue("?1", id);
            if (sql.Contains("?2", StringComparison.Ordinal))
            {
                _ = command.Parameters.AddWithValue("?2", (object?)retryAtMs ?? DBNull.Value);
            }
            if (sql.Contains("?3", StringComparison.Ordinal))
            {
                _ = command.Parameters.AddWithValue("?3", (object?)errorCode ?? DBNull.Value);
            }
            _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    private static UsageSegment ReadSegment(SqliteDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        new ApplicationIdentity(
            Enum.Parse<RuntimePlatform>(reader.GetString(2), ignoreCase: true),
            reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4)),
        reader.GetInt64(5),
        reader.GetInt64(6),
        reader.GetInt64(7),
        Enum.Parse<SegmentEndReason>(reader.GetString(8), ignoreCase: true));

    private static string WireName<T>(T value)
        where T : struct, Enum
    {
        var name = value.ToString();
        return string.Concat(char.ToLowerInvariant(name[0]), name[1..]);
    }

    private static void ValidateSegment(UsageSegment segment)
    {
        if (string.IsNullOrWhiteSpace(segment.Id)
            || string.IsNullOrWhiteSpace(segment.RuntimeSessionID)
            || string.IsNullOrWhiteSpace(segment.Application.RuntimeIdentity)
            || segment.StartAtMs < 0
            || segment.EndAtMs <= segment.StartAtMs
            || segment.DurationMilliseconds != segment.EndAtMs - segment.StartAtMs)
        {
            throw new ArgumentException("Usage segment is invalid.", nameof(segment));
        }
    }
}
