using Microsoft.Data.Sqlite;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record MachinePendingSegment(
    string LocalUserId,
    long AssignmentVersion,
    UsageSegment Segment,
    int AttemptCount);

public sealed record MachinePendingAccountingUsage(
    string LocalUserId,
    long AssignmentVersion,
    UsageSegmentV2 Segment,
    int AttemptCount);

public sealed record MachinePendingAccountingMedia(
    string LocalUserId,
    long AssignmentVersion,
    MediaSegmentV2 Segment,
    int AttemptCount);

public sealed record RestoredAccountingSession(
    string LocalUserId,
    long AssignmentVersion,
    AccountingRuntimeState State);

public sealed class MachineSegmentLedger
{
    private readonly string connectionString;

    public MachineSegmentLedger(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))
            ?? throw new InvalidOperationException("Ledger path has no directory."));
        connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
            Pooling = false,
        }.ToString();
    }

    public async Task InitializeAsync(string machineId, CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS machine_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS machine_segments(
              local_user_id TEXT NOT NULL,
              id TEXT NOT NULL,
              assignment_version INTEGER NOT NULL,
              runtime_session_id TEXT NOT NULL,
              platform TEXT NOT NULL,
              runtime_identity TEXT NOT NULL,
              display_name TEXT,
              start_at_ms INTEGER NOT NULL,
              end_at_ms INTEGER NOT NULL,
              duration_ms INTEGER NOT NULL,
              end_reason TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              created_at_ms INTEGER NOT NULL,
              PRIMARY KEY(local_user_id, id)
            );
            CREATE TABLE IF NOT EXISTS machine_outbox(
              local_user_id TEXT NOT NULL,
              segment_id TEXT NOT NULL,
              attempt_count INTEGER NOT NULL DEFAULT 0,
              next_attempt_at_ms INTEGER,
              last_error_code TEXT,
              terminal INTEGER NOT NULL DEFAULT 0,
              created_at_ms INTEGER NOT NULL,
              PRIMARY KEY(local_user_id, segment_id),
              FOREIGN KEY(local_user_id, segment_id) REFERENCES machine_segments(local_user_id, id)
            );
            CREATE TABLE IF NOT EXISTS machine_tamper_events(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              local_user_id TEXT,
              event_type TEXT NOT NULL,
              observed_at_ms INTEGER NOT NULL,
              details TEXT
            );
            CREATE TABLE IF NOT EXISTS machine_accounting_open_state_v2(
              local_user_id TEXT NOT NULL,
              runtime_session_id TEXT NOT NULL,
              assignment_version INTEGER NOT NULL,
              state_json TEXT NOT NULL,
              updated_at_ms INTEGER NOT NULL,
              PRIMARY KEY(local_user_id, runtime_session_id)
            );
            CREATE TABLE IF NOT EXISTS machine_usage_segments_v2(
              local_user_id TEXT NOT NULL,
              id TEXT NOT NULL,
              assignment_version INTEGER NOT NULL,
              payload_json TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              created_at_ms INTEGER NOT NULL,
              PRIMARY KEY(local_user_id, id)
            );
            CREATE TABLE IF NOT EXISTS machine_usage_outbox_v2(
              local_user_id TEXT NOT NULL,
              segment_id TEXT NOT NULL,
              attempt_count INTEGER NOT NULL DEFAULT 0,
              next_attempt_at_ms INTEGER,
              last_error_code TEXT,
              terminal INTEGER NOT NULL DEFAULT 0,
              created_at_ms INTEGER NOT NULL,
              PRIMARY KEY(local_user_id, segment_id),
              FOREIGN KEY(local_user_id, segment_id) REFERENCES machine_usage_segments_v2(local_user_id, id)
            );
            CREATE TABLE IF NOT EXISTS machine_media_segments_v2(
              local_user_id TEXT NOT NULL,
              id TEXT NOT NULL,
              assignment_version INTEGER NOT NULL,
              payload_json TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              created_at_ms INTEGER NOT NULL,
              PRIMARY KEY(local_user_id, id)
            );
            CREATE TABLE IF NOT EXISTS machine_media_outbox_v2(
              local_user_id TEXT NOT NULL,
              segment_id TEXT NOT NULL,
              attempt_count INTEGER NOT NULL DEFAULT 0,
              next_attempt_at_ms INTEGER,
              last_error_code TEXT,
              terminal INTEGER NOT NULL DEFAULT 0,
              created_at_ms INTEGER NOT NULL,
              PRIMARY KEY(local_user_id, segment_id),
              FOREIGN KEY(local_user_id, segment_id) REFERENCES machine_media_segments_v2(local_user_id, id)
            );
            CREATE INDEX IF NOT EXISTS idx_machine_usage_outbox_v2_due
              ON machine_usage_outbox_v2(terminal,next_attempt_at_ms,created_at_ms);
            CREATE INDEX IF NOT EXISTS idx_machine_media_outbox_v2_due
              ON machine_media_outbox_v2(terminal,next_attempt_at_ms,created_at_ms);
            """;
        _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        await using var bind = connection.CreateCommand();
        bind.CommandText = "INSERT INTO machine_metadata(key,value) VALUES('machine_id',?1) ON CONFLICT(key) DO NOTHING;";
        _ = bind.Parameters.AddWithValue("?1", machineId);
        _ = await bind.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        await using var verify = connection.CreateCommand();
        verify.CommandText = "SELECT value FROM machine_metadata WHERE key='machine_id';";
        if (!string.Equals((string?)await verify.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false), machineId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Runtime ledger belongs to another machine.");
        }
    }

    public async Task PersistAsync(
        string localUserId,
        long assignmentVersion,
        IReadOnlyList<UsageSegment> segments,
        CancellationToken cancellationToken = default)
    {
        if (segments.Count == 0) return;
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = connection.BeginTransaction(deferred: false);
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var segment in segments)
        {
            var hash = SegmentCanonicalizer.ContentHash(segment);
            await using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = """
                INSERT OR IGNORE INTO machine_segments(
                  local_user_id,id,assignment_version,runtime_session_id,platform,runtime_identity,
                  display_name,start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,created_at_ms
                ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13);
                """;
            _ = insert.Parameters.AddWithValue("?1", localUserId);
            _ = insert.Parameters.AddWithValue("?2", segment.Id);
            _ = insert.Parameters.AddWithValue("?3", assignmentVersion);
            _ = insert.Parameters.AddWithValue("?4", segment.RuntimeSessionID);
            _ = insert.Parameters.AddWithValue("?5", WireName(segment.Application.Platform));
            _ = insert.Parameters.AddWithValue("?6", segment.Application.RuntimeIdentity);
            _ = insert.Parameters.AddWithValue("?7", (object?)segment.Application.DisplayName ?? DBNull.Value);
            _ = insert.Parameters.AddWithValue("?8", segment.StartAtMs);
            _ = insert.Parameters.AddWithValue("?9", segment.EndAtMs);
            _ = insert.Parameters.AddWithValue("?10", segment.DurationMilliseconds);
            _ = insert.Parameters.AddWithValue("?11", WireName(segment.EndReason));
            _ = insert.Parameters.AddWithValue("?12", hash);
            _ = insert.Parameters.AddWithValue("?13", nowMs);
            var inserted = await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            if (inserted == 0)
            {
                await using var existing = connection.CreateCommand();
                existing.Transaction = transaction;
                existing.CommandText = "SELECT content_hash,assignment_version FROM machine_segments WHERE local_user_id=?1 AND id=?2;";
                _ = existing.Parameters.AddWithValue("?1", localUserId);
                _ = existing.Parameters.AddWithValue("?2", segment.Id);
                await using var reader = await existing.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
                if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
                    || !string.Equals(reader.GetString(0), hash, StringComparison.Ordinal)
                    || reader.GetInt64(1) != assignmentVersion)
                {
                    throw new InvalidOperationException($"Machine segment ID conflict: {segment.Id}.");
                }
            }
            await using var outbox = connection.CreateCommand();
            outbox.Transaction = transaction;
            outbox.CommandText = """
                INSERT OR IGNORE INTO machine_outbox(local_user_id,segment_id,created_at_ms)
                VALUES (?1,?2,?3);
                """;
            _ = outbox.Parameters.AddWithValue("?1", localUserId);
            _ = outbox.Parameters.AddWithValue("?2", segment.Id);
            _ = outbox.Parameters.AddWithValue("?3", nowMs);
            _ = await outbox.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task PersistAccountingTransitionAsync(
        string localUserId,
        long assignmentVersion,
        AccountingTransition transition,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(localUserId);
        ArgumentNullException.ThrowIfNull(transition);
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = connection.BeginTransaction(deferred: false);
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        foreach (var segment in transition.UsageSegments)
        {
            await InsertAccountingPayloadAsync(
                connection,
                transaction,
                "machine_usage_segments_v2",
                "machine_usage_outbox_v2",
                localUserId,
                assignmentVersion,
                segment.Id,
                System.Text.Json.JsonSerializer.Serialize(segment, RuntimeJson.Options),
                nowMs,
                cancellationToken).ConfigureAwait(false);
        }

        foreach (var segment in transition.MediaSegments)
        {
            await InsertAccountingPayloadAsync(
                connection,
                transaction,
                "machine_media_segments_v2",
                "machine_media_outbox_v2",
                localUserId,
                assignmentVersion,
                segment.Id,
                System.Text.Json.JsonSerializer.Serialize(segment, RuntimeJson.Options),
                nowMs,
                cancellationToken).ConfigureAwait(false);
        }

        await using var stateCommand = connection.CreateCommand();
        stateCommand.Transaction = transaction;
        stateCommand.CommandText = """
            INSERT INTO machine_accounting_open_state_v2(
              local_user_id,runtime_session_id,assignment_version,state_json,updated_at_ms
            ) VALUES(?1,?2,?3,?4,?5)
            ON CONFLICT(local_user_id,runtime_session_id) DO UPDATE SET
              assignment_version=excluded.assignment_version,
              state_json=excluded.state_json,
              updated_at_ms=excluded.updated_at_ms;
            """;
        _ = stateCommand.Parameters.AddWithValue("?1", localUserId);
        _ = stateCommand.Parameters.AddWithValue("?2", transition.State.RuntimeSessionID);
        _ = stateCommand.Parameters.AddWithValue("?3", assignmentVersion);
        _ = stateCommand.Parameters.AddWithValue("?4", System.Text.Json.JsonSerializer.Serialize(transition.State, RuntimeJson.Options));
        _ = stateCommand.Parameters.AddWithValue("?5", nowMs);
        _ = await stateCommand.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<RestoredAccountingSession>> RestoreAccountingSessionsAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT local_user_id,assignment_version,state_json
            FROM machine_accounting_open_state_v2
            ORDER BY local_user_id,runtime_session_id;
            """;
        var result = new List<RestoredAccountingSession>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            var state = System.Text.Json.JsonSerializer.Deserialize<AccountingRuntimeState>(
                reader.GetString(2), RuntimeJson.Options)
                ?? throw new InvalidDataException("Accounting open state is empty.");
            result.Add(new RestoredAccountingSession(reader.GetString(0), reader.GetInt64(1), state));
        }
        return result;
    }

    public async Task RemoveAccountingOpenStateAsync(
        string localUserId,
        string runtimeSessionId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM machine_accounting_open_state_v2 WHERE local_user_id=?1 AND runtime_session_id=?2;";
        _ = command.Parameters.AddWithValue("?1", localUserId);
        _ = command.Parameters.AddWithValue("?2", runtimeSessionId);
        _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<MachinePendingAccountingUsage>> PendingAccountingUsageAsync(
        int limit,
        long nowMs,
        CancellationToken cancellationToken = default)
    {
        var rows = await PendingAccountingPayloadsAsync(
            "machine_usage_segments_v2",
            "machine_usage_outbox_v2",
            limit,
            nowMs,
            cancellationToken).ConfigureAwait(false);
        return rows.Select(row => new MachinePendingAccountingUsage(
            row.LocalUserId,
            row.AssignmentVersion,
            System.Text.Json.JsonSerializer.Deserialize<UsageSegmentV2>(row.PayloadJson, RuntimeJson.Options)
                ?? throw new InvalidDataException("Usage accounting payload is empty."),
            row.AttemptCount)).ToArray();
    }

    public async Task<IReadOnlyList<MachinePendingAccountingMedia>> PendingAccountingMediaAsync(
        int limit,
        long nowMs,
        CancellationToken cancellationToken = default)
    {
        var rows = await PendingAccountingPayloadsAsync(
            "machine_media_segments_v2",
            "machine_media_outbox_v2",
            limit,
            nowMs,
            cancellationToken).ConfigureAwait(false);
        return rows.Select(row => new MachinePendingAccountingMedia(
            row.LocalUserId,
            row.AssignmentVersion,
            System.Text.Json.JsonSerializer.Deserialize<MediaSegmentV2>(row.PayloadJson, RuntimeJson.Options)
                ?? throw new InvalidDataException("Media accounting payload is empty."),
            row.AttemptCount)).ToArray();
    }

    public Task MarkAccountingUsageAcceptedAsync(
        IReadOnlySet<(string UserId, string SegmentId)> items,
        CancellationToken cancellationToken = default) =>
        UpdateAccountingOutboxAsync("machine_usage_outbox_v2", items, cancellationToken);

    public Task MarkAccountingMediaAcceptedAsync(
        IReadOnlySet<(string UserId, string SegmentId)> items,
        CancellationToken cancellationToken = default) =>
        UpdateAccountingOutboxAsync("machine_media_outbox_v2", items, cancellationToken);

    public Task RecordAccountingUsageFailureAsync(
        IReadOnlySet<(string UserId, string SegmentId)> items,
        string code,
        long retryAtMs,
        CancellationToken cancellationToken = default) =>
        RecordAccountingFailureAsync("machine_usage_outbox_v2", items, code, retryAtMs, cancellationToken);

    public Task RecordAccountingMediaFailureAsync(
        IReadOnlySet<(string UserId, string SegmentId)> items,
        string code,
        long retryAtMs,
        CancellationToken cancellationToken = default) =>
        RecordAccountingFailureAsync("machine_media_outbox_v2", items, code, retryAtMs, cancellationToken);

    public async Task<IReadOnlyList<MachinePendingSegment>> PendingAsync(int limit, long nowMs, CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT s.local_user_id,s.assignment_version,s.id,s.runtime_session_id,s.platform,
              s.runtime_identity,s.display_name,s.start_at_ms,s.end_at_ms,s.duration_ms,s.end_reason,o.attempt_count
            FROM machine_outbox o JOIN machine_segments s
              ON s.local_user_id=o.local_user_id AND s.id=o.segment_id
            WHERE o.terminal=0 AND (o.next_attempt_at_ms IS NULL OR o.next_attempt_at_ms<=?1)
            ORDER BY o.created_at_ms,o.local_user_id,o.segment_id LIMIT ?2;
            """;
        _ = command.Parameters.AddWithValue("?1", nowMs);
        _ = command.Parameters.AddWithValue("?2", limit);
        var result = new List<MachinePendingSegment>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(new MachinePendingSegment(reader.GetString(0), reader.GetInt64(1), new UsageSegment(
                reader.GetString(2), reader.GetString(3),
                new ApplicationIdentity(Enum.Parse<RuntimePlatform>(reader.GetString(4), true), reader.GetString(5), reader.IsDBNull(6) ? null : reader.GetString(6)),
                reader.GetInt64(7), reader.GetInt64(8), reader.GetInt64(9),
                Enum.Parse<SegmentEndReason>(reader.GetString(10), true)), reader.GetInt32(11)));
        }
        return result;
    }

    public Task MarkAcceptedAsync(IReadOnlySet<(string UserId, string SegmentId)> items, CancellationToken cancellationToken = default) =>
        UpdateOutboxAsync(items, "DELETE FROM machine_outbox WHERE local_user_id=?1 AND segment_id=?2;", null, null, cancellationToken);

    public Task RecordFailureAsync(IReadOnlySet<(string UserId, string SegmentId)> items, string code, long retryAtMs, CancellationToken cancellationToken = default) =>
        UpdateOutboxAsync(items, "UPDATE machine_outbox SET attempt_count=attempt_count+1,next_attempt_at_ms=?3,last_error_code=?4 WHERE local_user_id=?1 AND segment_id=?2;", retryAtMs, code, cancellationToken);

    public async Task RecordTamperAsync(string? localUserId, string eventType, string? details, CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO machine_tamper_events(local_user_id,event_type,observed_at_ms,details) VALUES(?1,?2,?3,?4);";
        _ = command.Parameters.AddWithValue("?1", (object?)localUserId ?? DBNull.Value);
        _ = command.Parameters.AddWithValue("?2", eventType);
        _ = command.Parameters.AddWithValue("?3", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _ = command.Parameters.AddWithValue("?4", (object?)details ?? DBNull.Value);
        _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<int> OutboxCountAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM machine_outbox WHERE terminal=0;";
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false), System.Globalization.CultureInfo.InvariantCulture);
    }

    private async Task UpdateOutboxAsync(IReadOnlySet<(string UserId, string SegmentId)> items, string sql, long? retryAtMs, string? code, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = connection.BeginTransaction(deferred: false);
        foreach (var item in items)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = sql;
            _ = command.Parameters.AddWithValue("?1", item.UserId);
            _ = command.Parameters.AddWithValue("?2", item.SegmentId);
            if (sql.Contains("?3", StringComparison.Ordinal)) _ = command.Parameters.AddWithValue("?3", (object?)retryAtMs ?? DBNull.Value);
            if (sql.Contains("?4", StringComparison.Ordinal)) _ = command.Parameters.AddWithValue("?4", (object?)code ?? DBNull.Value);
            _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task InsertAccountingPayloadAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string segmentTable,
        string outboxTable,
        string localUserId,
        long assignmentVersion,
        string id,
        string payloadJson,
        long nowMs,
        CancellationToken cancellationToken)
    {
        await using var insert = connection.CreateCommand();
        insert.Transaction = transaction;
        insert.CommandText = $"""
            INSERT OR IGNORE INTO {segmentTable}(
              local_user_id,id,assignment_version,payload_json,content_hash,created_at_ms
            ) VALUES(?1,?2,?3,?4,?5,?6);
            """;
        _ = insert.Parameters.AddWithValue("?1", localUserId);
        _ = insert.Parameters.AddWithValue("?2", id);
        _ = insert.Parameters.AddWithValue("?3", assignmentVersion);
        _ = insert.Parameters.AddWithValue("?4", payloadJson);
        _ = insert.Parameters.AddWithValue("?5", id);
        _ = insert.Parameters.AddWithValue("?6", nowMs);
        var inserted = await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        if (inserted == 0)
        {
            await using var verify = connection.CreateCommand();
            verify.Transaction = transaction;
            verify.CommandText = $"SELECT content_hash,assignment_version FROM {segmentTable} WHERE local_user_id=?1 AND id=?2;";
            _ = verify.Parameters.AddWithValue("?1", localUserId);
            _ = verify.Parameters.AddWithValue("?2", id);
            await using var reader = await verify.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
            if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
                || !string.Equals(reader.GetString(0), id, StringComparison.Ordinal)
                || reader.GetInt64(1) != assignmentVersion)
            {
                throw new InvalidOperationException($"Accounting segment ID conflict: {id}.");
            }
        }

        await using var outbox = connection.CreateCommand();
        outbox.Transaction = transaction;
        outbox.CommandText = $"INSERT OR IGNORE INTO {outboxTable}(local_user_id,segment_id,created_at_ms) VALUES(?1,?2,?3);";
        _ = outbox.Parameters.AddWithValue("?1", localUserId);
        _ = outbox.Parameters.AddWithValue("?2", id);
        _ = outbox.Parameters.AddWithValue("?3", nowMs);
        _ = await outbox.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task<IReadOnlyList<PendingAccountingPayload>> PendingAccountingPayloadsAsync(
        string segmentTable,
        string outboxTable,
        int limit,
        long nowMs,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = $"""
            SELECT s.local_user_id,s.assignment_version,s.payload_json,o.attempt_count
            FROM {outboxTable} o JOIN {segmentTable} s
              ON s.local_user_id=o.local_user_id AND s.id=o.segment_id
            WHERE o.terminal=0 AND (o.next_attempt_at_ms IS NULL OR o.next_attempt_at_ms<=?1)
            ORDER BY o.created_at_ms,o.local_user_id,o.segment_id LIMIT ?2;
            """;
        _ = command.Parameters.AddWithValue("?1", nowMs);
        _ = command.Parameters.AddWithValue("?2", limit);
        var rows = new List<PendingAccountingPayload>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            rows.Add(new PendingAccountingPayload(
                reader.GetString(0),
                reader.GetInt64(1),
                reader.GetString(2),
                reader.GetInt32(3)));
        }
        return rows;
    }

    private async Task UpdateAccountingOutboxAsync(
        string table,
        IReadOnlySet<(string UserId, string SegmentId)> items,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = connection.BeginTransaction(deferred: false);
        foreach (var item in items)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = $"DELETE FROM {table} WHERE local_user_id=?1 AND segment_id=?2;";
            _ = command.Parameters.AddWithValue("?1", item.UserId);
            _ = command.Parameters.AddWithValue("?2", item.SegmentId);
            _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task RecordAccountingFailureAsync(
        string table,
        IReadOnlySet<(string UserId, string SegmentId)> items,
        string code,
        long retryAtMs,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = connection.BeginTransaction(deferred: false);
        foreach (var item in items)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = $"""
                UPDATE {table} SET attempt_count=attempt_count+1,next_attempt_at_ms=?3,
                  last_error_code=?4 WHERE local_user_id=?1 AND segment_id=?2;
                """;
            _ = command.Parameters.AddWithValue("?1", item.UserId);
            _ = command.Parameters.AddWithValue("?2", item.SegmentId);
            _ = command.Parameters.AddWithValue("?3", retryAtMs);
            _ = command.Parameters.AddWithValue("?4", code);
            _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    private sealed record PendingAccountingPayload(
        string LocalUserId,
        long AssignmentVersion,
        string PayloadJson,
        int AttemptCount);

    private async Task<SqliteConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;";
        _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        return connection;
    }

    private static string WireName<T>(T value) where T : struct, Enum
    {
        var name = value.ToString();
        return string.Concat(char.ToLowerInvariant(name[0]), name[1..]);
    }
}
