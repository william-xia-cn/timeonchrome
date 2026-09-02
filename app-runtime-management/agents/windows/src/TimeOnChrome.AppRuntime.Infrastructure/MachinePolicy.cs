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
    AppPolicyQuotaConfig Quotas);

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
