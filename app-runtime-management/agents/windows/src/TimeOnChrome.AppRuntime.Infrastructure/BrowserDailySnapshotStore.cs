using System.Text.Json;
using Microsoft.Data.Sqlite;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

/// <summary>Local-only browser-authoritative snapshots. The v2 raw mirror is not read here.</summary>
public sealed class BrowserDailySnapshotStore
{
    private readonly string connectionString;

    public BrowserDailySnapshotStore(string databasePath)
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
            CREATE TABLE IF NOT EXISTS browser_daily_snapshots_v3(
              session_id INTEGER NOT NULL,
              local_user_id TEXT NOT NULL,
              profile_id TEXT NOT NULL,
              date TEXT NOT NULL,
              snapshot_revision TEXT NOT NULL,
              statistics_revision TEXT NOT NULL,
              correction_revision TEXT NOT NULL,
              computed_at_ms INTEGER NOT NULL,
              complete INTEGER NOT NULL,
              payload_json TEXT NOT NULL,
              received_at_ms INTEGER NOT NULL,
              PRIMARY KEY(session_id,profile_id,date)
            );
            CREATE TABLE IF NOT EXISTS browser_snapshot_dirty_days_v3(
              session_id INTEGER NOT NULL,
              local_user_id TEXT NOT NULL,
              profile_id TEXT NOT NULL,
              date TEXT NOT NULL,
              dirty_revision INTEGER NOT NULL DEFAULT 1,
              PRIMARY KEY(session_id,profile_id,date)
            );
            CREATE TABLE IF NOT EXISTS browser_runtime_session_links_v3(
              runtime_session_id TEXT PRIMARY KEY,
              session_id INTEGER NOT NULL,
              local_user_id TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS browser_shared_daily_shadow_v3(
              session_id INTEGER NOT NULL,
              local_user_id TEXT NOT NULL,
              profile_id TEXT NOT NULL,
              date TEXT NOT NULL,
              snapshot_revision TEXT NOT NULL,
              available INTEGER NOT NULL,
              unavailable_reason_code TEXT,
              browser_seconds INTEGER NOT NULL,
              application_seconds INTEGER NOT NULL,
              overlap_adjustment_seconds INTEGER NOT NULL,
              shared_seconds INTEGER,
              projected_at_ms INTEGER NOT NULL,
              PRIMARY KEY(session_id,profile_id,date)
            );
            """;
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        await using var recover = connection.CreateCommand();
        recover.CommandText = """
            INSERT INTO browser_snapshot_dirty_days_v3(session_id,local_user_id,profile_id,date)
            SELECT session_id,local_user_id,profile_id,date FROM browser_daily_snapshots_v3 WHERE 1=1
            ON CONFLICT(session_id,profile_id,date) DO UPDATE SET dirty_revision=dirty_revision+1;
            """;
        await recover.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task RecordRuntimeSessionAsync(int sessionId, string localUserId, string runtimeSessionId,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT OR IGNORE INTO browser_runtime_session_links_v3(runtime_session_id,session_id,local_user_id) VALUES($runtime,$session,$user);";
        command.Parameters.AddWithValue("$runtime", runtimeSessionId);
        command.Parameters.AddWithValue("$session", sessionId);
        command.Parameters.AddWithValue("$user", localUserId);
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task MarkApplicationDaysDirtyAsync(int sessionId, string localUserId,
        IEnumerable<UsageSegmentV2> segments, CancellationToken cancellationToken = default)
    {
        var dates = new HashSet<string>(StringComparer.Ordinal);
        foreach (var segment in segments.Where(item => item.AuthoritativeForUsage))
        {
            for (var cursor = segment.StartWallTimeMs; cursor < segment.EndWallTimeMs;)
            {
                var day = DateTimeOffset.FromUnixTimeMilliseconds(cursor).ToOffset(TimeSpan.FromHours(8));
                dates.Add(day.ToString("yyyy-MM-dd"));
                cursor = new DateTimeOffset(day.Year, day.Month, day.Day, 0, 0, 0,
                    TimeSpan.FromHours(8)).AddDays(1).ToUnixTimeMilliseconds();
            }
        }
        if (dates.Count == 0) return;
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        foreach (var date in dates)
        {
            await using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO browser_snapshot_dirty_days_v3(session_id,local_user_id,profile_id,date)
                SELECT session_id,local_user_id,profile_id,date FROM browser_daily_snapshots_v3
                 WHERE session_id=$session AND local_user_id=$user AND date=$date
                ON CONFLICT(session_id,profile_id,date) DO UPDATE SET dirty_revision=dirty_revision+1;
                """;
            command.Parameters.AddWithValue("$session", sessionId);
            command.Parameters.AddWithValue("$user", localUserId);
            command.Parameters.AddWithValue("$date", date);
            await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    public async Task<BrowserSnapshotWriteResult> ReplaceAsync(
        int sessionId,
        string localUserId,
        string profileId,
        BrowserDailyUsageSnapshot snapshot,
        long receivedAtMs,
        CancellationToken cancellationToken = default)
    {
        if (sessionId < 0 || string.IsNullOrWhiteSpace(localUserId) || !Guid.TryParse(profileId, out _))
            throw new InvalidDataException("Browser snapshot owner is invalid.");
        BrowserDailySnapshotValidator.Validate(snapshot);
        var payload = JsonSerializer.Serialize(snapshot, RuntimeJson.Options);
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);
        await using (var current = connection.CreateCommand())
        {
            current.Transaction = (SqliteTransaction)transaction;
            current.CommandText = """
                SELECT computed_at_ms,snapshot_revision,payload_json
                FROM browser_daily_snapshots_v3
                WHERE session_id=$session AND profile_id=$profile AND date=$date;
                """;
            current.Parameters.AddWithValue("$session", sessionId);
            current.Parameters.AddWithValue("$profile", profileId);
            current.Parameters.AddWithValue("$date", snapshot.Date);
            await using var reader = await current.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
            if (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                var oldComputedAt = reader.GetInt64(0);
                var sameRevision = reader.GetString(1) == snapshot.SnapshotRevision;
                if (sameRevision)
                {
                    var previous = JsonSerializer.Deserialize<BrowserDailyUsageSnapshot>(reader.GetString(2), RuntimeJson.Options);
                    if (previous is null || !SameContent(previous, snapshot))
                        throw new InvalidDataException("Browser snapshot revision conflicts with stored content.");
                    return new BrowserSnapshotWriteResult(false, true, false);
                }
                if (snapshot.ComputedAtMs <= oldComputedAt)
                    return new BrowserSnapshotWriteResult(false, false, true);
            }
        }
        await using (var write = connection.CreateCommand())
        {
            write.Transaction = (SqliteTransaction)transaction;
            write.CommandText = """
                INSERT INTO browser_daily_snapshots_v3(
                  session_id,local_user_id,profile_id,date,snapshot_revision,statistics_revision,correction_revision,
                  computed_at_ms,complete,payload_json,received_at_ms)
                VALUES($session,$user,$profile,$date,$revision,$statistics,$correction,$computed,$complete,$payload,$received)
                ON CONFLICT(session_id,profile_id,date) DO UPDATE SET
                  local_user_id=excluded.local_user_id,
                  snapshot_revision=excluded.snapshot_revision,
                  statistics_revision=excluded.statistics_revision,
                  correction_revision=excluded.correction_revision,
                  computed_at_ms=excluded.computed_at_ms,
                  complete=excluded.complete,
                  payload_json=excluded.payload_json,
                  received_at_ms=excluded.received_at_ms;
                """;
            write.Parameters.AddWithValue("$session", sessionId);
            write.Parameters.AddWithValue("$user", localUserId);
            write.Parameters.AddWithValue("$profile", profileId);
            write.Parameters.AddWithValue("$date", snapshot.Date);
            write.Parameters.AddWithValue("$revision", snapshot.SnapshotRevision);
            write.Parameters.AddWithValue("$statistics", snapshot.StatisticsRevision);
            write.Parameters.AddWithValue("$correction", snapshot.CorrectionRevision);
            write.Parameters.AddWithValue("$computed", snapshot.ComputedAtMs);
            write.Parameters.AddWithValue("$complete", snapshot.Complete ? 1 : 0);
            write.Parameters.AddWithValue("$payload", payload);
            write.Parameters.AddWithValue("$received", receivedAtMs);
            await write.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await using (var dirty = connection.CreateCommand())
        {
            dirty.Transaction = (SqliteTransaction)transaction;
            dirty.CommandText = """
                INSERT INTO browser_snapshot_dirty_days_v3(session_id,local_user_id,profile_id,date)
                VALUES($session,$user,$profile,$date)
                ON CONFLICT(session_id,profile_id,date) DO UPDATE SET dirty_revision=dirty_revision+1;
                """;
            dirty.Parameters.AddWithValue("$session", sessionId);
            dirty.Parameters.AddWithValue("$user", localUserId);
            dirty.Parameters.AddWithValue("$profile", profileId);
            dirty.Parameters.AddWithValue("$date", snapshot.Date);
            await dirty.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return new BrowserSnapshotWriteResult(true, false, false);
    }

    public async Task<bool> ProcessNextDirtyDayAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        int sessionId;
        string localUserId;
        string profileId;
        string date;
        long dirtyRevision;
        await using (var next = connection.CreateCommand())
        {
            next.CommandText = "SELECT session_id,local_user_id,profile_id,date,dirty_revision FROM browser_snapshot_dirty_days_v3 ORDER BY date,session_id LIMIT 1;";
            await using var reader = await next.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
            if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false)) return false;
            sessionId = reader.GetInt32(0);
            localUserId = reader.GetString(1);
            profileId = reader.GetString(2);
            date = reader.GetString(3);
            dirtyRevision = reader.GetInt64(4);
        }
        BrowserDailyUsageSnapshot snapshot;
        await using (var read = connection.CreateCommand())
        {
            read.CommandText = "SELECT payload_json FROM browser_daily_snapshots_v3 WHERE session_id=$session AND profile_id=$profile AND date=$date;";
            read.Parameters.AddWithValue("$session", sessionId);
            read.Parameters.AddWithValue("$profile", profileId);
            read.Parameters.AddWithValue("$date", date);
            var json = await read.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false) as string;
            if (json is null) throw new InvalidDataException("Dirty browser snapshot is missing.");
            snapshot = JsonSerializer.Deserialize<BrowserDailyUsageSnapshot>(json, RuntimeJson.Options)
                ?? throw new InvalidDataException("Dirty browser snapshot is invalid.");
        }
        var runtimeIds = new HashSet<string>(StringComparer.Ordinal);
        await using (var links = connection.CreateCommand())
        {
            links.CommandText = "SELECT runtime_session_id FROM browser_runtime_session_links_v3 WHERE session_id=$session AND local_user_id=$user;";
            links.Parameters.AddWithValue("$session", sessionId);
            links.Parameters.AddWithValue("$user", localUserId);
            await using var reader = await links.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false)) runtimeIds.Add(reader.GetString(0));
        }
        var parsed = DateOnly.ParseExact(date, "yyyy-MM-dd");
        var dayStart = new DateTimeOffset(parsed.Year, parsed.Month, parsed.Day, 0, 0, 0,
            TimeSpan.FromHours(8)).ToUnixTimeMilliseconds();
        var dayEnd = dayStart + 86_400_000;
        var appIntervals = new List<ApplicationCreditedInterval>();
        var mappingComplete = runtimeIds.Count > 0;
        await using var tableCheck = connection.CreateCommand();
        tableCheck.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='machine_usage_segments_v2';";
        var hasAppLedger = Convert.ToInt32(await tableCheck.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false)) > 0;
        if (!hasAppLedger) mappingComplete = false;
        if (hasAppLedger)
        {
            await using var apps = connection.CreateCommand();
            apps.CommandText = """
                SELECT payload_json FROM machine_usage_segments_v2
                 WHERE local_user_id=$user AND json_extract(payload_json,'$.startWallTimeMs') < $end
                   AND json_extract(payload_json,'$.endWallTimeMs') > $start;
                """;
            apps.Parameters.AddWithValue("$user", localUserId);
            apps.Parameters.AddWithValue("$start", dayStart);
            apps.Parameters.AddWithValue("$end", dayEnd);
            await using var reader = await apps.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                var segment = JsonSerializer.Deserialize<UsageSegmentV2>(reader.GetString(0), RuntimeJson.Options);
                if (segment?.AuthoritativeForUsage != true) continue;
                if (!runtimeIds.Contains(segment.RuntimeSessionID))
                {
                    mappingComplete = false;
                    continue;
                }
                var start = Math.Max(dayStart, segment.StartWallTimeMs);
                var end = Math.Min(dayEnd, segment.EndWallTimeMs);
                if (end <= start) continue;
                // Clock/monotonic mismatch is not rounded into a purported precise total.
                var duration = segment.EndWallTimeMs - segment.StartWallTimeMs == segment.MonotonicDurationMilliseconds
                    ? end - start : -1;
                appIntervals.Add(new ApplicationCreditedInterval(start, end, duration));
            }
        }
        var browserIntervals = snapshot.Intervals.Select(item =>
            new BrowserCreditedInterval(item.StartMs, item.EndMs, item.CreditedSeconds)).ToArray();
        var result = BrowserSharedDailyProjector.Project(snapshot.ActiveSeconds, snapshot.Complete,
            browserIntervals, appIntervals, mappingComplete);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);
        await using (var current = connection.CreateCommand())
        {
            current.Transaction = (SqliteTransaction)transaction;
            current.CommandText = "SELECT snapshot_revision FROM browser_daily_snapshots_v3 WHERE session_id=$session AND profile_id=$profile AND date=$date;";
            current.Parameters.AddWithValue("$session", sessionId);
            current.Parameters.AddWithValue("$profile", profileId);
            current.Parameters.AddWithValue("$date", date);
            var currentRevision = await current.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false) as string;
            if (currentRevision != snapshot.SnapshotRevision) return true;
        }
        await using (var write = connection.CreateCommand())
        {
            write.Transaction = (SqliteTransaction)transaction;
            write.CommandText = """
                INSERT INTO browser_shared_daily_shadow_v3(session_id,local_user_id,profile_id,date,snapshot_revision,
                  available,unavailable_reason_code,browser_seconds,application_seconds,overlap_adjustment_seconds,
                  shared_seconds,projected_at_ms)
                VALUES($session,$user,$profile,$date,$revision,$available,$reason,$browser,$application,$overlap,$shared,$now)
                ON CONFLICT(session_id,profile_id,date) DO UPDATE SET
                  snapshot_revision=excluded.snapshot_revision,available=excluded.available,
                  unavailable_reason_code=excluded.unavailable_reason_code,browser_seconds=excluded.browser_seconds,
                  application_seconds=excluded.application_seconds,overlap_adjustment_seconds=excluded.overlap_adjustment_seconds,
                  shared_seconds=excluded.shared_seconds,projected_at_ms=excluded.projected_at_ms;
                """;
            write.Parameters.AddWithValue("$session", sessionId);
            write.Parameters.AddWithValue("$user", localUserId);
            write.Parameters.AddWithValue("$profile", profileId);
            write.Parameters.AddWithValue("$date", date);
            write.Parameters.AddWithValue("$revision", snapshot.SnapshotRevision);
            write.Parameters.AddWithValue("$available", result.Available ? 1 : 0);
            write.Parameters.AddWithValue("$reason", (object?)result.UnavailableReasonCode ?? DBNull.Value);
            write.Parameters.AddWithValue("$browser", result.BrowserSeconds);
            write.Parameters.AddWithValue("$application", result.ApplicationSeconds);
            write.Parameters.AddWithValue("$overlap", result.OverlapAdjustmentSeconds);
            write.Parameters.AddWithValue("$shared", (object?)result.SharedSeconds ?? DBNull.Value);
            write.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            await write.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await using (var delete = connection.CreateCommand())
        {
            delete.Transaction = (SqliteTransaction)transaction;
            delete.CommandText = "DELETE FROM browser_snapshot_dirty_days_v3 WHERE session_id=$session AND profile_id=$profile AND date=$date AND dirty_revision=$revision;";
            delete.Parameters.AddWithValue("$session", sessionId);
            delete.Parameters.AddWithValue("$profile", profileId);
            delete.Parameters.AddWithValue("$date", date);
            delete.Parameters.AddWithValue("$revision", dirtyRevision);
            await delete.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return true;
    }

    public async Task<BrowserSharedDailyResult?> ReadSharedDayAsync(int sessionId, string profileId,
        string date, CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT shared.available,shared.unavailable_reason_code,shared.browser_seconds,
                   shared.application_seconds,shared.overlap_adjustment_seconds,shared.shared_seconds
              FROM browser_shared_daily_shadow_v3 shared
              JOIN browser_daily_snapshots_v3 snapshot
                ON snapshot.session_id=shared.session_id AND snapshot.profile_id=shared.profile_id
               AND snapshot.date=shared.date AND snapshot.snapshot_revision=shared.snapshot_revision
             WHERE shared.session_id=$session AND shared.profile_id=$profile AND shared.date=$date
               AND NOT EXISTS(SELECT 1 FROM browser_snapshot_dirty_days_v3 dirty
                 WHERE dirty.session_id=shared.session_id AND dirty.profile_id=shared.profile_id AND dirty.date=shared.date);
            """;
        command.Parameters.AddWithValue("$session", sessionId);
        command.Parameters.AddWithValue("$profile", profileId);
        command.Parameters.AddWithValue("$date", date);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        if (!await reader.ReadAsync(cancellationToken).ConfigureAwait(false)) return null;
        return new BrowserSharedDailyResult(reader.GetInt64(0) != 0,
            reader.IsDBNull(1) ? null : reader.GetString(1), reader.GetInt64(2), reader.GetInt64(3),
            reader.GetInt64(4), reader.IsDBNull(5) ? null : reader.GetInt64(5));
    }

    private static bool SameContent(BrowserDailyUsageSnapshot left, BrowserDailyUsageSnapshot right)
    {
        if (left.Date != right.Date || left.StatisticsRevision != right.StatisticsRevision
            || left.CorrectionRevision != right.CorrectionRevision || left.ActiveSeconds != right.ActiveSeconds
            || left.Complete != right.Complete || left.QuotaBucketSeconds.Count != right.QuotaBucketSeconds.Count)
            return false;
        if (left.QuotaBucketSeconds.Any(bucket => !right.QuotaBucketSeconds.TryGetValue(bucket.Key, out var value)
                || value != bucket.Value)) return false;
        return left.IncompleteReasonCodes.Order().SequenceEqual(right.IncompleteReasonCodes.Order())
            && left.Intervals.SequenceEqual(right.Intervals);
    }
}

public sealed record BrowserSnapshotWriteResult(bool Accepted, bool Duplicate, bool Stale);
