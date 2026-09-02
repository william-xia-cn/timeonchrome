using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public enum MachinePolicyState
{
    Pending,
    Cached,
    Applied,
    Failed,
    Offline,
}

public sealed record MachineUserAssignment(
    string LocalUserId,
    long AssignmentVersion,
    string? ChildId,
    bool Protected);

public sealed record MachinePolicy(
    long Version,
    string? DefaultChildId,
    IReadOnlyList<MachineUserAssignment> Users,
    IReadOnlyList<MachineChildAppPolicy>? AppPolicies = null);

public sealed record MachineChildAppPolicy(string ChildId, AppPolicyDocument Policy);

public sealed record AppPolicyDocument(
    long Version,
    long? EffectiveAtMs,
    IReadOnlyList<AppPolicyClassification> Classifications,
    AppPolicyQuotaConfig Quotas,
    IReadOnlyDictionary<string, IReadOnlyDictionary<string, IReadOnlyList<AppPolicyTimeWindow>>>? TimeWindows = null);

public sealed record AppPolicyTimeWindow(string Start, string End);

public sealed record AppPolicyClassification(
    RuntimePlatform Platform,
    string RuntimeIdentity,
    string? DisplayName,
    ApplicationClassification Classification);

public sealed record AppPolicyQuotaConfig(
    IReadOnlyDictionary<string, int?> DailyCategoryMinutes,
    int? WeeklyRestrictedEntertainmentMinutes,
    IReadOnlyList<AppPolicyApplicationQuota> PerApplicationDailyMinutes);

public sealed record AppPolicyApplicationQuota(RuntimePlatform Platform, string RuntimeIdentity, int? Minutes);

public sealed record AppliedMachinePolicy(
    MachinePolicy Policy,
    long CachedAtMs,
    long AppliedAtMs);

public static class AppPolicySchedule
{
    public static readonly string[] Weekdays =
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    public static readonly string[] Categories =
        ["study", "composite", "restrictedEntertainment", "unclassified"];

    public static IReadOnlyDictionary<string, IReadOnlyDictionary<string, IReadOnlyList<AppPolicyTimeWindow>>> AllOpen() =>
        Weekdays.ToDictionary(
            day => day,
            _ => (IReadOnlyDictionary<string, IReadOnlyList<AppPolicyTimeWindow>>)Categories.ToDictionary(
                category => category,
                _ => (IReadOnlyList<AppPolicyTimeWindow>)[new("00:00", "24:00")],
                StringComparer.Ordinal),
            StringComparer.Ordinal);

    public static IReadOnlyDictionary<string, IReadOnlyDictionary<string, IReadOnlyList<AppPolicyTimeWindow>>> Effective(
        AppPolicyDocument policy) => policy.TimeWindows ?? AllOpen();

    public static bool IsAllowed(AppPolicyDocument policy, ApplicationClassification classification, DateTimeOffset beijingTime)
    {
        var category = AccountingSegmentId.Wire(classification);
        if (!Categories.Contains(category, StringComparer.Ordinal)) return true;
        var weekday = beijingTime.DayOfWeek switch
        {
            DayOfWeek.Monday => "monday",
            DayOfWeek.Tuesday => "tuesday",
            DayOfWeek.Wednesday => "wednesday",
            DayOfWeek.Thursday => "thursday",
            DayOfWeek.Friday => "friday",
            DayOfWeek.Saturday => "saturday",
            _ => "sunday",
        };
        if (!Effective(policy).TryGetValue(weekday, out var day)
            || !day.TryGetValue(category, out var windows)) return true;
        var minute = beijingTime.Hour * 60 + beijingTime.Minute;
        return windows.Any(window => Minute(window.Start) <= minute && minute < Minute(window.End));
    }

    private static int Minute(string value)
    {
        if (string.Equals(value, "24:00", StringComparison.Ordinal)) return 1_440;
        var parts = value.Split(':');
        return int.Parse(parts[0], System.Globalization.CultureInfo.InvariantCulture) * 60
            + int.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture);
    }
}

public sealed class MachinePolicyStore
{
    private readonly string path;

    public MachinePolicyStore(string path) => this.path = Path.GetFullPath(path);

    public async Task SaveAsync(AppliedMachinePolicy policy, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("Policy path has no directory."));
        var bytes = JsonSerializer.SerializeToUtf8Bytes(policy, RuntimeJson.Options);
        await MachineCredentialStore.AtomicWriteAsync(path, bytes, cancellationToken).ConfigureAwait(false);
    }

    public async Task<AppliedMachinePolicy?> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(path)) return null;
        var bytes = await File.ReadAllBytesAsync(path, cancellationToken).ConfigureAwait(false);
        return JsonSerializer.Deserialize<AppliedMachinePolicy>(bytes, RuntimeJson.Options)
            ?? throw new InvalidDataException("Machine policy is empty.");
    }

    public static MachineUserAssignment? AssignmentFor(MachinePolicy policy, string localUserId) =>
        policy.Users.FirstOrDefault(user => string.Equals(user.LocalUserId, localUserId, StringComparison.Ordinal));

    public static AccountingPolicySnapshot SnapshotFor(
        MachinePolicy policy,
        MachineUserAssignment assignment,
        ApplicationIdentity? application)
    {
        if (application is null)
            return new AccountingPolicySnapshot(assignment.AssignmentVersion, "unclassified");
        var appPolicy = policy.AppPolicies?.FirstOrDefault(item =>
            string.Equals(item.ChildId, assignment.ChildId, StringComparison.Ordinal));
        var classification = appPolicy?.Policy.Classifications.FirstOrDefault(item =>
            item.Platform == application.Platform
            && string.Equals(item.RuntimeIdentity, application.RuntimeIdentity, StringComparison.Ordinal))?.Classification
            ?? ApplicationClassification.Unclassified;
        return new AccountingPolicySnapshot(
            assignment.AssignmentVersion,
            AccountingSegmentId.Wire(classification),
            appPolicy?.Policy.Version,
            classification);
    }
}
