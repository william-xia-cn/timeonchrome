using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record PendingMachineTerminalLog(MachineTerminalLogUpload Log, int AttemptCount);

public sealed partial class MachineTerminalLogStore
{
    public static readonly string[] Categories = ["service", "session", "policy", "upload", "storage", "security", "accounting"];
    private readonly string connectionString;

    public MachineTerminalLogStore(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))
            ?? throw new InvalidOperationException("Terminal log path has no directory."));
        connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = Path.GetFullPath(path), Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared, Pooling = false,
        }.ToString();
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS machine_terminal_logs_v1(
              id TEXT PRIMARY KEY, observed_at_ms INTEGER NOT NULL, level TEXT NOT NULL,
              category TEXT NOT NULL, event_code TEXT NOT NULL, module TEXT NOT NULL,
              message_code TEXT NOT NULL, details_json TEXT NOT NULL, service_version TEXT NOT NULL,
              policy_version INTEGER, created_at_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS machine_terminal_log_outbox_v1(
              log_id TEXT PRIMARY KEY, attempt_count INTEGER NOT NULL DEFAULT 0,
              next_attempt_at_ms INTEGER, last_error_code TEXT, created_at_ms INTEGER NOT NULL,
              FOREIGN KEY(log_id) REFERENCES machine_terminal_logs_v1(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_machine_terminal_log_time_v1
              ON machine_terminal_logs_v1(observed_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_machine_terminal_log_outbox_due_v1
              ON machine_terminal_log_outbox_v1(next_attempt_at_ms,created_at_ms);
            """;
        _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task WriteAsync(
        string level,
        string category,
        string eventCode,
        string module,
        string messageCode,
        IReadOnlyDictionary<string, object>? details,
        string serviceVersion,
        MachineLoggingPolicy? policy,
        long nowMs,
        CancellationToken cancellationToken = default)
    {
        Validate(level, category, eventCode, module, messageCode, serviceVersion, details);
        var id = $"log-{nowMs}-{Guid.NewGuid():N}";
        var safeDetails = details ?? new Dictionary<string, object>();
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = connection.BeginTransaction(deferred: false);
        await using (var insert = connection.CreateCommand())
        {
            insert.Transaction = transaction;
            insert.CommandText = """
                INSERT INTO machine_terminal_logs_v1(
                  id,observed_at_ms,level,category,event_code,module,message_code,details_json,
                  service_version,policy_version,created_at_ms
                ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?2);
                """;
            _ = insert.Parameters.AddWithValue("?1", id);
            _ = insert.Parameters.AddWithValue("?2", nowMs);
            _ = insert.Parameters.AddWithValue("?3", level);
            _ = insert.Parameters.AddWithValue("?4", category);
            _ = insert.Parameters.AddWithValue("?5", eventCode);
            _ = insert.Parameters.AddWithValue("?6", module);
            _ = insert.Parameters.AddWithValue("?7", messageCode);
            _ = insert.Parameters.AddWithValue("?8", JsonSerializer.Serialize(safeDetails, RuntimeJson.Options));
            _ = insert.Parameters.AddWithValue("?9", serviceVersion);
            _ = insert.Parameters.AddWithValue("?10", policy is null ? DBNull.Value : policy.Version);
            _ = await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        if (policy?.Allows(level, category, nowMs) == true)
        {
            await using var outbox = connection.CreateCommand();
            outbox.Transaction = transaction;
            outbox.CommandText = "INSERT INTO machine_terminal_log_outbox_v1(log_id,created_at_ms) VALUES (?1,?2);";
            _ = outbox.Parameters.AddWithValue("?1", id);
            _ = outbox.Parameters.AddWithValue("?2", nowMs);
            _ = await outbox.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        await TrimAsync(connection, nowMs, cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<PendingMachineTerminalLog>> PendingAsync(
        int limit, long nowMs, CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT l.id,l.observed_at_ms,l.level,l.category,l.event_code,l.module,l.message_code,
              l.details_json,l.service_version,l.policy_version,o.attempt_count
            FROM machine_terminal_log_outbox_v1 o JOIN machine_terminal_logs_v1 l ON l.id=o.log_id
            WHERE o.next_attempt_at_ms IS NULL OR o.next_attempt_at_ms<=?1
            ORDER BY o.created_at_ms ASC LIMIT ?2;
            """;
        _ = command.Parameters.AddWithValue("?1", nowMs);
        _ = command.Parameters.AddWithValue("?2", limit);
        var result = new List<PendingMachineTerminalLog>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            var details = JsonSerializer.Deserialize<Dictionary<string, object>>(reader.GetString(7), RuntimeJson.Options)
                ?? new Dictionary<string, object>();
            result.Add(new PendingMachineTerminalLog(new MachineTerminalLogUpload(
                reader.GetString(0), reader.GetInt64(1), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.GetString(5), reader.GetString(6), details,
                reader.GetString(8), reader.GetInt64(9)), reader.GetInt32(10)));
        }
        return result;
    }

    public Task MarkAcceptedAsync(IReadOnlySet<string> ids, CancellationToken cancellationToken = default) =>
        UpdateAsync(ids, null, null, cancellationToken);

    public Task RecordFailureAsync(IReadOnlySet<string> ids, string code, long retryAtMs, CancellationToken cancellationToken = default) =>
        UpdateAsync(ids, code, retryAtMs, cancellationToken);

    private async Task UpdateAsync(IReadOnlySet<string> ids, string? code, long? retryAtMs, CancellationToken cancellationToken)
    {
        if (ids.Count == 0) return;
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = connection.BeginTransaction(deferred: false);
        foreach (var id in ids)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = code is null
                ? "DELETE FROM machine_terminal_log_outbox_v1 WHERE log_id=?1;"
                : "UPDATE machine_terminal_log_outbox_v1 SET attempt_count=attempt_count+1,next_attempt_at_ms=?2,last_error_code=?3 WHERE log_id=?1;";
            _ = command.Parameters.AddWithValue("?1", id);
            if (code is not null)
            {
                _ = command.Parameters.AddWithValue("?2", retryAtMs);
                _ = command.Parameters.AddWithValue("?3", code);
            }
            _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task TrimAsync(SqliteConnection connection, long nowMs, CancellationToken cancellationToken)
    {
        await using var trim = connection.CreateCommand();
        trim.CommandText = """
            DELETE FROM machine_terminal_logs_v1
            WHERE id NOT IN (SELECT log_id FROM machine_terminal_log_outbox_v1)
              AND (observed_at_ms<?1 OR id NOT IN (
                SELECT id FROM machine_terminal_logs_v1 ORDER BY observed_at_ms DESC LIMIT 5000
              ));
            """;
        _ = trim.Parameters.AddWithValue("?1", nowMs - 7 * 86_400_000L);
        _ = await trim.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static void Validate(string level, string category, params object?[] values)
    {
        if (!new[] { "info", "warning", "error" }.Contains(level, StringComparer.Ordinal)
            || !Categories.Contains(category, StringComparer.Ordinal)) throw new ArgumentException("Invalid terminal log classification.");
        foreach (var value in values)
        {
            if (value is string text && (!SafeCode().IsMatch(text) || text.Length > 96)) throw new ArgumentException("Terminal log value is not safe.");
            if (value is IReadOnlyDictionary<string, object> details && details.Any(item =>
                !SafeCode().IsMatch(item.Key) || item.Key.Length > 48 || item.Value is string stringValue
                && (!SafeCode().IsMatch(stringValue) || stringValue.Length > 96))) throw new ArgumentException("Terminal log details are not safe.");
        }
    }

    private async Task<SqliteConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;";
        _ = await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        return connection;
    }

    [GeneratedRegex("^[a-zA-Z0-9_.-]+$")]
    private static partial Regex SafeCode();
}
