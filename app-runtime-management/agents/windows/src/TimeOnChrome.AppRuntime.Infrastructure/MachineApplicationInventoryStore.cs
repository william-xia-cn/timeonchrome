using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record MachineApplicationObservation(string LocalUserId, AppEvidence Evidence, string Status);
public sealed record ApplicationInventorySourceResult(string Source, string Status, int ObservationCount,
    IReadOnlyList<string> WarningCodes);
public sealed record ApplicationInventoryScan(string ScanId, string LocalUserId, int BatchIndex, int BatchCount,
    int ObservationCount, IReadOnlyList<string> FailedSources, bool Completed,
    IReadOnlyList<ApplicationInventorySourceResult>? SourceResults = null, int ProductCount = 0, int VariantCount = 0);
public sealed record MachineApplicationInventoryBatch(int SchemaVersion, string BatchId, IReadOnlyList<MachineApplicationObservation> Observations,
    ApplicationInventoryScan? Scan = null);
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
            CREATE TABLE IF NOT EXISTS runtime_inventory_scan_receipts_v1(scan_id TEXT NOT NULL,batch_index INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(scan_id,batch_index));
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
    public async Task ObserveAsync(IReadOnlyList<MachineApplicationObservation> observations, CancellationToken token = default,
        ApplicationInventoryScan? scan = null)
    {
        if (observations.Count > 200) throw new ArgumentOutOfRangeException(nameof(observations));
        await using var db = await OpenAsync(token).ConfigureAwait(false);
        await using var transaction = await db.BeginTransactionAsync(token).ConfigureAwait(false);
        IReadOnlyList<MachineApplicationObservation> toApply = observations;
        if (scan is not null)
        {
            ValidateScan(scan, observations);
            var scanPayload = JsonSerializer.Serialize(new MachineApplicationInventoryBatch(1, scan.ScanId, observations, scan), RuntimeJson.Options);
            await using var receipt = db.CreateCommand(); receipt.Transaction = (SqliteTransaction)transaction;
            receipt.CommandText = "SELECT payload_json FROM runtime_inventory_scan_receipts_v1 WHERE scan_id=$scan AND batch_index=$index";
            receipt.Parameters.AddWithValue("$scan", scan.ScanId); receipt.Parameters.AddWithValue("$index", scan.BatchIndex);
            if (await receipt.ExecuteScalarAsync(token).ConfigureAwait(false) is string original)
            {
                if (original != scanPayload) throw new InvalidDataException("INVENTORY_SCAN_CONFLICT");
                return; // Idempotent pipe replay, no duplicate outbox.
            }
            if (scan.Completed)
            {
                receipt.CommandText = "SELECT payload_json FROM runtime_inventory_scan_receipts_v1 WHERE scan_id=$scan ORDER BY batch_index";
                await using var reader = await receipt.ExecuteReaderAsync(token).ConfigureAwait(false);
                var received = new List<MachineApplicationInventoryBatch>();
                while (await reader.ReadAsync(token).ConfigureAwait(false)) received.Add(JsonSerializer.Deserialize<MachineApplicationInventoryBatch>(reader.GetString(0), RuntimeJson.Options)!);
                if (received.Count != scan.BatchCount || received.Sum(item => item.Observations.Count) != scan.ObservationCount
                    || received.SelectMany(item => item.Observations).Select(item => item.Evidence.RuntimeIdentity).Distinct(StringComparer.Ordinal).Count() != scan.ObservationCount
                    || received.Where((item, index) => item.Scan?.BatchIndex != index || item.Scan?.LocalUserId != scan.LocalUserId
                        || item.Scan?.BatchCount != scan.BatchCount || item.Scan?.ObservationCount != scan.ObservationCount
                        || !item.Scan.FailedSources.SequenceEqual(scan.FailedSources)
                        || JsonSerializer.Serialize(item.Scan.SourceResults, RuntimeJson.Options) != JsonSerializer.Serialize(scan.SourceResults, RuntimeJson.Options)).Any())
                    throw new InvalidDataException("INVENTORY_SCAN_INCOMPLETE");
                var completeSources = scan.SourceResults?.Where(item => item.Status is "complete" or "complete_with_warnings")
                    .Select(item => item.Source).ToHashSet(StringComparer.Ordinal);
                if (scan.FailedSources.Count == 0 || completeSources is { Count: > 0 })
                {
                    var present = received.SelectMany(item => item.Observations).Select(item => item.Evidence.RuntimeIdentity).ToHashSet(StringComparer.Ordinal);
                    await reader.DisposeAsync().ConfigureAwait(false);
                    await using var cache = db.CreateCommand(); cache.Transaction = (SqliteTransaction)transaction;
                    cache.CommandText = "SELECT payload_json FROM runtime_inventory_cache_v1 WHERE local_user_id=$user AND payload_json IS NOT NULL";
                    cache.Parameters.AddWithValue("$user", scan.LocalUserId);
                    await using var stored = await cache.ExecuteReaderAsync(token).ConfigureAwait(false);
                    var absent = new List<MachineApplicationObservation>();
                    while (await stored.ReadAsync(token).ConfigureAwait(false))
                    {
                        var item = JsonSerializer.Deserialize<MachineApplicationObservation>(stored.GetString(0), RuntimeJson.Options)!;
                        var source = item.Evidence.Discovery?.SourceKind;
                        var sourceCanReconcile = completeSources is null ? scan.FailedSources.Count == 0
                            : source is not null && completeSources.Contains(source);
                        if (item.Status == "installed" && sourceCanReconcile && !present.Contains(item.Evidence.RuntimeIdentity))
                            absent.Add(item with { Status = "notObserved" });
                    }
                    toApply = absent;
                }
            }
            receipt.CommandText = "INSERT INTO runtime_inventory_scan_receipts_v1 VALUES($scan,$index,$payload)";
            receipt.Parameters.AddWithValue("$payload", scanPayload);
            await receipt.ExecuteNonQueryAsync(token).ConfigureAwait(false);
        }
        var changed = new List<MachineApplicationObservation>();
        foreach (var incoming in toApply)
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
        var batches = new List<MachineApplicationInventoryBatch>();
        if (scan is null || scan.Completed)
            foreach (var chunk in changed.Chunk(200)) batches.Add(new(scan?.SourceResults is not null || chunk.Any(item=>item.Evidence.Discovery?.ObjectKind is not null) ? 2 : 1, Guid.NewGuid().ToString("N"), chunk));
        if (scan is not null) batches.Add(new(scan.SourceResults is null ? 1 : 2, Guid.NewGuid().ToString("N"), observations, scan));
        // Missing-install observations and the final marker share this transaction, ordered before completion.
        foreach (var batch in batches)
        {
            await using var command = db.CreateCommand(); command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "INSERT INTO runtime_inventory_outbox_v1 VALUES($id,$payload)";
            command.Parameters.AddWithValue("$id", batch.BatchId);
            command.Parameters.AddWithValue("$payload", JsonSerializer.Serialize(batch, RuntimeJson.Options));
            await command.ExecuteNonQueryAsync(token).ConfigureAwait(false);
        }
        await transaction.CommitAsync(token).ConfigureAwait(false);
    }
    public static void ValidateScan(ApplicationInventoryScan scan, IReadOnlyList<MachineApplicationObservation> observations)
    {
        var invalidSourceResults = scan.SourceResults is not null &&
            (scan.ProductCount + scan.VariantCount != scan.ObservationCount
             || scan.SourceResults.Count > 6
             || scan.SourceResults.Select(item => item.Source).Distinct(StringComparer.Ordinal).Count() != scan.SourceResults.Count
             || scan.SourceResults.Any(item =>
                 !System.Text.RegularExpressions.Regex.IsMatch(item.Source, "^[a-z-]{1,32}$")
                 || item.Status is not ("complete" or "complete_with_warnings" or "failed")
                 || item.ObservationCount < 0
                 || item.WarningCodes.Count > 64
                 || item.WarningCodes.Any(code => !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z0-9_]{1,64}$"))));
        if (!System.Text.RegularExpressions.Regex.IsMatch(scan.ScanId, "^[a-f0-9]{32}$")
            || string.IsNullOrWhiteSpace(scan.LocalUserId) || scan.BatchCount is < 0 or > 50
            || scan.ObservationCount is < 0 or > 10000 || scan.BatchCount != (scan.ObservationCount + 199) / 200
            || scan.BatchIndex < 0 || scan.BatchIndex > scan.BatchCount
            || scan.Completed != (scan.BatchIndex == scan.BatchCount)
            || (scan.Completed ? observations.Count != 0 : observations.Count != Math.Min(200, scan.ObservationCount - scan.BatchIndex * 200))
            || observations.Any(item => item.LocalUserId != scan.LocalUserId || item.Status != "installed")
            || scan.FailedSources.Count > 16 || scan.FailedSources.Any(item => !System.Text.RegularExpressions.Regex.IsMatch(item, "^[A-Za-z0-9_-]{1,64}$"))
            || scan.ProductCount < 0 || scan.VariantCount < 0 || invalidSourceResults)
            throw new InvalidDataException("INVALID_INVENTORY_SCAN");
    }
    public async Task<MachineApplicationInventoryBatch?> PeekAsync(CancellationToken token = default)
    {
        await using var db = await OpenAsync(token).ConfigureAwait(false);
        await using var command = db.CreateCommand();
        command.CommandText = "SELECT payload_json FROM runtime_inventory_outbox_v1 ORDER BY rowid LIMIT 1";
        return await command.ExecuteScalarAsync(token).ConfigureAwait(false) is string json
            ? JsonSerializer.Deserialize<MachineApplicationInventoryBatch>(json, RuntimeJson.Options) : null;
    }
    public async Task<IReadOnlyList<string>> ScanIdentitiesAsync(string scanId, CancellationToken token = default)
    {
        await using var db = await OpenAsync(token).ConfigureAwait(false);
        await using var command = db.CreateCommand();
        command.CommandText = "SELECT payload_json FROM runtime_inventory_scan_receipts_v1 WHERE scan_id=$scan ORDER BY batch_index";
        command.Parameters.AddWithValue("$scan", scanId);
        await using var reader = await command.ExecuteReaderAsync(token).ConfigureAwait(false);
        var identities = new List<string>();
        while (await reader.ReadAsync(token).ConfigureAwait(false))
            identities.AddRange(JsonSerializer.Deserialize<MachineApplicationInventoryBatch>(reader.GetString(0), RuntimeJson.Options)!.Observations.Select(item => item.Evidence.RuntimeIdentity));
        return identities;
    }
    public async Task ReconcileAsync(string localUserId, IReadOnlyList<string> completeIdentitySet, CancellationToken token = default)
    {
        if (completeIdentitySet.Count > 10000 || completeIdentitySet.Any(string.IsNullOrWhiteSpace))
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
