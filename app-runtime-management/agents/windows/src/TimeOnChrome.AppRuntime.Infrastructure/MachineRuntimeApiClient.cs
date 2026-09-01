using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record MachineEnrollmentResponse(string MachineId, string MachineToken, RuntimePlatform Platform);
public sealed record MachineUserReport(string LocalUserId, string DisplayName, bool SessionActive);
public sealed record MachinePolicyAck(long Version, string State, string? Error, IReadOnlyList<MachineUserPolicyAck>? Users = null);
public sealed record MachineUserPolicyAck(string LocalUserId, string State);
public sealed record MachineHeartbeat(string ServiceVersion, string WindowsVersion, string Architecture, int TamperCount, string PolicyState);
public sealed record MachineSegmentUpload(string LocalUserId, long AssignmentVersion, UsageSegment Segment);

public sealed class MachineRuntimeApiClient
{
    private readonly HttpClient httpClient;

    public MachineRuntimeApiClient(HttpClient httpClient) => this.httpClient = httpClient;

    public async Task<MachineRuntimeCredential> EnrollAsync(Uri serverUrl, string code, string displayName, CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PostAsJsonAsync(new Uri(serverUrl, "/v2/machines/enroll"),
            new { code, platform = "windows", displayName }, RuntimeJson.Options, cancellationToken).ConfigureAwait(false);
        var enrollment = await ReadAsync<MachineEnrollmentResponse>(response, cancellationToken).ConfigureAwait(false);
        return new MachineRuntimeCredential(serverUrl, enrollment.MachineId, enrollment.MachineToken, enrollment.Platform);
    }

    public Task ReportUsersAsync(MachineRuntimeCredential credential, IReadOnlyList<MachineUserReport> users, CancellationToken cancellationToken = default) =>
        SendWithoutResultAsync(HttpMethod.Put, credential, "/v2/machines/users", new { users }, cancellationToken);

    public async Task<(MachinePolicy? Policy, string? ETag)> GetPolicyAsync(
        MachineRuntimeCredential credential,
        string? etag,
        CancellationToken cancellationToken = default)
    {
        using var request = Authorized(HttpMethod.Get, credential, "/v2/machines/policy");
        if (!string.IsNullOrWhiteSpace(etag)) request.Headers.TryAddWithoutValidation("If-None-Match", etag);
        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        if (response.StatusCode == HttpStatusCode.NotModified) return (null, etag);
        var policy = await ReadAsync<MachinePolicy>(response, cancellationToken).ConfigureAwait(false);
        return (policy, response.Headers.ETag?.ToString());
    }

    public Task AcknowledgePolicyAsync(MachineRuntimeCredential credential, MachinePolicyAck acknowledgement, CancellationToken cancellationToken = default) =>
        SendWithoutResultAsync(HttpMethod.Post, credential, "/v2/machines/policy-ack", acknowledgement, cancellationToken);

    public Task HeartbeatAsync(MachineRuntimeCredential credential, MachineHeartbeat heartbeat, CancellationToken cancellationToken = default) =>
        SendWithoutResultAsync(HttpMethod.Post, credential, "/v2/machines/heartbeat", heartbeat, cancellationToken);

    public Task AuthorizeUninstallAsync(MachineRuntimeCredential credential, string code, CancellationToken cancellationToken = default) =>
        SendWithoutResultAsync(HttpMethod.Post, credential, "/v2/machines/uninstall", new { code }, cancellationToken);

    public async Task<UploadAcceptance> UploadAsync(
        MachineRuntimeCredential credential,
        IReadOnlyList<MachineSegmentUpload> segments,
        CancellationToken cancellationToken = default)
    {
        var payload = new
        {
            schemaVersion = 2,
            segments = segments.Select(item => new
            {
                item.LocalUserId,
                item.AssignmentVersion,
                item.Segment.Id,
                item.Segment.RuntimeSessionID,
                item.Segment.Application,
                item.Segment.StartAtMs,
                item.Segment.EndAtMs,
                item.Segment.DurationMilliseconds,
                item.Segment.EndReason,
            }),
        };
        using var request = Authorized(HttpMethod.Post, credential, "/v2/segments:upload");
        request.Content = JsonContent.Create(payload, options: RuntimeJson.Options);
        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        return await ReadAsync<UploadAcceptance>(response, cancellationToken).ConfigureAwait(false);
    }

    public Task RetireLegacyAsync(RuntimeCredential credential, CancellationToken cancellationToken = default) =>
        SendWithoutResultAsync(HttpMethod.Post,
            new MachineRuntimeCredential(credential.ServerUrl, credential.DeviceId, credential.DeviceToken, credential.Platform),
            "/v1/devices/self/retire", new { }, cancellationToken);

    private async Task SendWithoutResultAsync(HttpMethod method, MachineRuntimeCredential credential, string path, object body, CancellationToken cancellationToken)
    {
        using var request = Authorized(method, credential, path);
        request.Content = JsonContent.Create(body, options: RuntimeJson.Options);
        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        _ = await ReadAsync<Dictionary<string, object>>(response, cancellationToken).ConfigureAwait(false);
    }

    private static HttpRequestMessage Authorized(HttpMethod method, MachineRuntimeCredential credential, string path)
    {
        var request = new HttpRequestMessage(method, new Uri(credential.ServerUrl, path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credential.MachineToken);
        return request;
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (!response.IsSuccessStatusCode) throw new RuntimeApiException("Runtime machine API request failed.", (int)response.StatusCode);
        return await response.Content.ReadFromJsonAsync<T>(RuntimeJson.Options, cancellationToken).ConfigureAwait(false)
            ?? throw new RuntimeApiException("Runtime machine API returned an empty response.");
    }
}
