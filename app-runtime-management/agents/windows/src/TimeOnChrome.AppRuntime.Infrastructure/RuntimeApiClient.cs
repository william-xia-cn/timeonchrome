using System.Net.Http.Headers;
using System.Net.Http.Json;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record EnrollmentRequest(
    string Code,
    RuntimePlatform Platform,
    string? DisplayName);

public sealed record EnrollmentResponse(
    string DeviceId,
    string DeviceToken,
    RuntimePlatform Platform);

public sealed record UploadRequest(
    int SchemaVersion,
    IReadOnlyList<UsageSegment> Segments);

public sealed record HeartbeatRequest(string AgentVersion, string WindowsVersion, string Architecture);

public sealed record HeartbeatResponse(bool Success, string Status, int NextHeartbeatSeconds);

public sealed class RuntimeApiException : Exception
{
    public RuntimeApiException(string message, int? statusCode = null)
        : base(message)
    {
        StatusCode = statusCode;
    }

    public int? StatusCode { get; }
}

public sealed class RuntimeApiClient
{
    private readonly HttpClient httpClient;

    public RuntimeApiClient(HttpClient httpClient)
    {
        this.httpClient = httpClient;
    }

    public async Task<RuntimeCredential> EnrollAsync(
        Uri serverUrl,
        string code,
        string? displayName,
        CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PostAsJsonAsync(
            new Uri(serverUrl, "/v1/devices/enroll"),
            new EnrollmentRequest(code, RuntimePlatform.Windows, displayName),
            RuntimeJson.Options,
            cancellationToken).ConfigureAwait(false);
        var enrollment = await ReadSuccessAsync<EnrollmentResponse>(response, cancellationToken)
            .ConfigureAwait(false);
        if (enrollment.Platform != RuntimePlatform.Windows)
        {
            throw new RuntimeApiException("Enrollment response platform mismatch.");
        }

        return new RuntimeCredential(
            serverUrl,
            enrollment.DeviceId,
            enrollment.DeviceToken,
            enrollment.Platform);
    }

    public async Task<UploadAcceptance> UploadAsync(
        RuntimeCredential credential,
        IReadOnlyList<UsageSegment> segments,
        CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            new Uri(credential.ServerUrl, "/v1/segments:upload"))
        {
            Content = JsonContent.Create(new UploadRequest(1, segments), options: RuntimeJson.Options),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credential.DeviceToken);
        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        return await ReadSuccessAsync<UploadAcceptance>(response, cancellationToken).ConfigureAwait(false);
    }

    public async Task<HeartbeatResponse> HeartbeatAsync(
        RuntimeCredential credential,
        string agentVersion,
        CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(credential.ServerUrl, "/v1/devices/heartbeat"))
        {
            Content = JsonContent.Create(new HeartbeatRequest(
                agentVersion,
                Environment.OSVersion.VersionString,
                System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString().ToLowerInvariant()), options: RuntimeJson.Options),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credential.DeviceToken);
        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        return await ReadSuccessAsync<HeartbeatResponse>(response, cancellationToken).ConfigureAwait(false);
    }

    private static async Task<T> ReadSuccessAsync<T>(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        if (!response.IsSuccessStatusCode)
        {
            throw new RuntimeApiException(
                "Runtime API request failed.",
                checked((int)response.StatusCode));
        }

        return await response.Content.ReadFromJsonAsync<T>(RuntimeJson.Options, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new RuntimeApiException("Runtime API returned an empty response.");
    }
}
