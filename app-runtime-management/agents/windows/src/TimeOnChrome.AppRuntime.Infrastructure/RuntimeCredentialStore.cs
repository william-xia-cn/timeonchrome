using System.Security.Cryptography;
using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record RuntimeCredential(
    Uri ServerUrl,
    string DeviceId,
    string DeviceToken,
    RuntimePlatform Platform);

public interface IRuntimeCredentialStore
{
    Task SaveAsync(RuntimeCredential credential, CancellationToken cancellationToken = default);

    Task<RuntimeCredential?> LoadAsync(CancellationToken cancellationToken = default);

    Task DeleteAsync(CancellationToken cancellationToken = default);
}

public sealed class DpapiRuntimeCredentialStore : IRuntimeCredentialStore
{
    private static readonly byte[] Entropy = "TimeOnChrome.AppRuntime.Credential.v1"u8.ToArray();
    private readonly string path;

    public DpapiRuntimeCredentialStore(string path)
    {
        this.path = Path.GetFullPath(path);
    }

    public async Task SaveAsync(RuntimeCredential credential, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(credential);
        var directory = Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("Credential path has no directory.");
        Directory.CreateDirectory(directory);
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(credential, RuntimeJson.Options);
        var protectedBytes = ProtectedData.Protect(plaintext, Entropy, DataProtectionScope.CurrentUser);
        var temporaryPath = string.Concat(path, ".tmp");
        await File.WriteAllBytesAsync(temporaryPath, protectedBytes, cancellationToken).ConfigureAwait(false);
        File.Move(temporaryPath, path, overwrite: true);
    }

    public async Task<RuntimeCredential?> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        var protectedBytes = await File.ReadAllBytesAsync(path, cancellationToken).ConfigureAwait(false);
        var plaintext = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
        return JsonSerializer.Deserialize<RuntimeCredential>(plaintext, RuntimeJson.Options)
            ?? throw new InvalidDataException("Runtime credential is empty.");
    }

    public Task DeleteAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }
}
