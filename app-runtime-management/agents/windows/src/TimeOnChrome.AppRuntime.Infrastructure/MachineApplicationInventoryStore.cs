using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record MachineApplicationObservation(string LocalUserId, AppEvidence Evidence, string Status);
public sealed record MachineApplicationInventoryBatch(int SchemaVersion, string BatchId, IReadOnlyList<MachineApplicationObservation> Observations);
public sealed record MachineApplicationInventoryAck(string BatchId, string Status, int AcceptedCount);

/// <summary>Independent inventory outbox; discovery never creates usage or changes cloud policy.</summary>
public sealed class MachineApplicationInventoryStore
{
    private readonly string connectionString;
    private readonly string machineId;
    public MachineApplicationInventoryStore(string path, string machineId)
    {
        this.machineId = machineId;
        connectionString = new SqliteConnectionStringBuilder { DataSource = Path.GetFullPath(path), DefaultTimeout = 10, Pooling = false }.ToString();
    }
    private async Task<SqliteConnection> OpenAsync(CancellationToken token)
    {
        var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(token).ConfigureAwait(false);
        return connection;
    }
    public async Task InitializeAsync(CancellationToken token = default)
    {
        await using var db = await OpenAsync(token).ConfigureAwait(false);
        await using var command = db.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS runtime_inventory_owner_v1(id INTEGER PRIMARY KEY CHECK(id=1),machine_id TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS runtime_inventory_cache_v1(local_user_id TEXT NOT NULL,runtime_identity TEXT NOT NULL,payload_hash TEXT NOT NULL,payload_json TEXT,PRIMARY KEY(local_user_id,runtime_identity));
            CREATE TABLE IF NOT EXISTS runtime_inventory_outbox_v1(batch_id TEXT PRIMARY KEY NOT NULL,payload_json TEXT NOT NULL);
            INSERT OR IGNORE INTO runtime_inventory_owner_v1(id,machine_id) VALUES(1,$machine);
            """;
        command.Parameters.AddWithValue("$machine", machineId);
        await command.ExecuteNonQueryAsync(token).ConfigureAwait(false);
        command.CommandText = "SELECT machine_id FROM runtime_inventory_owner_v1 WHERE id=1";
        if (!string.Equals(await command.ExecuteScalarAsync(token).ConfigureAwait(false) as string, machineId, StringComparison.Ordinal))
            throw new InvalidDataException("INVENTORY_MACHINE_MISMATCH");
        command.CommandText = "SELECT COUNT(*) FROM pragma_table_info('runtime_inventory_cache_v1') WHERE name='payload_json'";
        if (Convert.ToInt64(await command.ExecuteScalarAsync(token).ConfigureAwait(false), System.Globalization.CultureInfo.InvariantCulture) == 0)
        {
            command.CommandText = "ALTER TABLE runtime_inventory_cache_v1 ADD COLUMN payload_json TEXT";
            await command.ExecuteNonQueryAsync(token).ConfigureAwait(false);
        }
    }
    public async Task ObserveAsync(IReadOnlyList<MachineApplicationObservation> observations, CancellationToken token = default)
    {
        if (observations.Count > 200) throw new ArgumentOutOfRangeException(nameof(observations));
        await using var db = await OpenAsync(token).ConfigureAwait(false);
        await using var transaction = await db.BeginTransactionAsync(token).ConfigureAwait(false);
        var changed = new List<MachineApplicationObservation>();
        foreach (var incoming in observations)
        {
            var observation = incoming;
            if (observation.Status is not ("installed" or "runtimeObserved" or "notObserved")) throw new InvalidDataException("INVALID_INVENTORY_STATUS");
            if (observation.Status == "runtimeObserved")
            {
                await using var existing = db.CreateCommand(); existing.Transaction = (SqliteTransaction)transaction;
                existing.CommandText = "SELECT payload_json FROM runtime_inventory_cache_v1 WHERE local_user_id=$user AND runtime_identity=$identity";
                existing.Parameters.AddWithValue("$user", observation.LocalUserId);
                existing.Parameters.AddWithValue("$identity", observation.Evidence.RuntimeIdentity);
                if (await existing.ExecuteScalarAsync(token).ConfigureAwait(false) is string stored
                    && JsonSerializer.Deserialize<MachineApplicationObservation>(stored, RuntimeJson.Options)?.Status == "installed")
                    observation = observation with { Status = "installed" };
            }
            var payload = JsonSerializer.Serialize(observation, RuntimeJson.Options);
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
            await using var command = db.CreateCommand(); command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "SELECT payload_hash FROM runtime_inventory_cache_v1 WHERE local_user_id=$user AND runtime_identity=$identity";
            command.Parameters.AddWithValue("$user", observation.LocalUserId);
            command.Parameters.AddWithValue("$identity", observation.Evidence.RuntimeIdentity);
            if (string.Equals(await command.ExecuteScalarAsync(token).ConfigureAwait(false) as string, hash, StringComparison.Ordinal)) continue;
            command.CommandText = "INSERT INTO runtime_inventory_cache_v1(local_user_id,runtime_identity,payload_hash,payload_json) VALUES($user,$identity,$hash,$payload) ON CONFLICT(local_user_id,runtime_identity) DO UPDATE SET payload_hash=excluded.payload_hash,payload_json=excluded.payload_json";
            command.Parameters.AddWithValue("$hash", hash);
            command.Parameters.AddWithValue("$payload", payload);
            await command.ExecuteNonQueryAsync(token).ConfigureAwait(false);
            changed.Add(observation);
        }
        if (changed.Count > 0)
        {
            var batch = new MachineApplicationInventoryBatch(1, Guid.NewGuid().ToString("N"), changed);
            await using var command = db.CreateCommand(); command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "INSERT INTO runtime_inventory_outbox_v1 VALUES($id,$payload)";
            command.Parameters.AddWithValue("$id", batch.BatchId);
            command.Parameters.AddWithValue("$payload", JsonSerializer.Serialize(batch, RuntimeJson.Options));
            await command.ExecuteNonQueryAsync(token).ConfigureAwait(false);
        }
        await transaction.CommitAsync(token).ConfigureAwait(false);
    }
    public async Task<MachineApplicationInventoryBatch?> PeekAsync(CancellationToken token = default)
    {
        await using var db = await OpenAsync(token).ConfigureAwait(false);
        await using var command = db.CreateCommand();
        command.CommandText = "SELECT payload_json FROM runtime_inventory_outbox_v1 ORDER BY rowid LIMIT 1";
        return await command.ExecuteScalarAsync(token).ConfigureAwait(false) is string json
            ? JsonSerializer.Deserialize<MachineApplicationInventoryBatch>(json, RuntimeJson.Options) : null;
    }
    public async Task ReconcileAsync(string localUserId, IReadOnlyList<string> completeIdentitySet, CancellationToken token = default)
    {
        if (completeIdentitySet.Count > 1000 || completeIdentitySet.Any(string.IsNullOrWhiteSpace))
            throw new InvalidDataException("INVALID_COMPLETE_INVENTORY");
        var present = completeIdentitySet.ToHashSet(StringComparer.Ordinal);
        var absent = (await ListAsync(token).ConfigureAwait(false))
            .Where(item => item.LocalUserId == localUserId && item.Status == "installed" && !present.Contains(item.Evidence.RuntimeIdentity))
            .Select(item => item with { Status = "notObserved" });
        foreach (var chunk in absent.Chunk(200)) await ObserveAsync(chunk, token).ConfigureAwait(false);
    }
    public async Task<IReadOnlyList<MachineApplicationObservation>> ListAsync(CancellationToken token = default)
    {
        await using var db = await OpenAsync(token).ConfigureAwait(false);
        await using var command = db.CreateCommand();
        command.CommandText = "SELECT payload_json FROM runtime_inventory_cache_v1 WHERE payload_json IS NOT NULL ORDER BY local_user_id,runtime_identity";
        await using var reader = await command.ExecuteReaderAsync(token).ConfigureAwait(false);
        var observations = new List<MachineApplicationObservation>();
        while (await reader.ReadAsync(token).ConfigureAwait(false))
            observations.Add(JsonSerializer.Deserialize<MachineApplicationObservation>(reader.GetString(0), RuntimeJson.Options)
                ?? throw new InvalidDataException("INVALID_INVENTORY_CACHE"));
        return observations;
    }
    public async Task AcknowledgeAsync(MachineApplicationInventoryBatch batch, MachineApplicationInventoryAck ack, CancellationToken token = default)
    {
        if (ack.BatchId != batch.BatchId || ack.AcceptedCount != batch.Observations.Count || ack.Status is not ("accepted" or "duplicate"))
            throw new InvalidDataException("INVALID_INVENTORY_ACK");
        await using var db = await OpenAsync(token).ConfigureAwait(false);
        await using var command = db.CreateCommand(); command.CommandText = "DELETE FROM runtime_inventory_outbox_v1 WHERE batch_id=$id";
        command.Parameters.AddWithValue("$id", batch.BatchId);
        await command.ExecuteNonQueryAsync(token).ConfigureAwait(false);
    }
}
