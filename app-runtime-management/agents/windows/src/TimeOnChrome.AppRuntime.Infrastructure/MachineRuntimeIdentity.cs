using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record MachineRuntimeCredential(
    Uri ServerUrl,
    string MachineId,
    string MachineToken,
    RuntimePlatform Platform);

public sealed record MachineRuntimePaths(
    string RootDirectory,
    string DatabasePath,
    string CredentialPath,
    string MachineKeyPath,
    string PolicyPath,
    string LogPath)
{
    public static MachineRuntimePaths ForMachine(string? rootOverride = null)
    {
        var root = rootOverride ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "TimeOnChrome",
            "AppRuntime");
        return new MachineRuntimePaths(
            root,
            Path.Combine(root, "runtime-machine-v2.db"),
            Path.Combine(root, "machine-credential-v2.dat"),
            Path.Combine(root, "machine-hmac-key-v2.dat"),
            Path.Combine(root, "policy-lkg-v2.json"),
            Path.Combine(root, "runtime-service-v2.jsonl"));
    }
}

public sealed class MachineCredentialStore
{
    private static readonly byte[] Entropy = "TimeOnChrome.AppRuntime.MachineCredential.v2"u8.ToArray();
    private readonly string path;

    public MachineCredentialStore(string path) => this.path = Path.GetFullPath(path);

    public async Task SaveAsync(MachineRuntimeCredential credential, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(credential);
        Directory.CreateDirectory(Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("Credential path has no directory."));
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(credential, RuntimeJson.Options);
        var protectedBytes = ProtectedData.Protect(plaintext, Entropy, DataProtectionScope.LocalMachine);
        await AtomicWriteAsync(path, protectedBytes, cancellationToken).ConfigureAwait(false);
    }

    public async Task<MachineRuntimeCredential?> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(path)) return null;
        var protectedBytes = await File.ReadAllBytesAsync(path, cancellationToken).ConfigureAwait(false);
        var plaintext = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.LocalMachine);
        return JsonSerializer.Deserialize<MachineRuntimeCredential>(plaintext, RuntimeJson.Options)
            ?? throw new InvalidDataException("Machine credential is empty.");
    }

    public static async Task AtomicWriteAsync(string path, byte[] content, CancellationToken cancellationToken)
    {
        var temporary = string.Concat(path, ".tmp");
        await File.WriteAllBytesAsync(temporary, content, cancellationToken).ConfigureAwait(false);
        File.Move(temporary, path, overwrite: true);
    }
}

public sealed class MachineUserIdentityDeriver
{
    private readonly byte[] key;

    public MachineUserIdentityDeriver(byte[] key)
    {
        if (key is null || key.Length < 32) throw new ArgumentException("Machine key must contain at least 32 bytes.", nameof(key));
        this.key = key.ToArray();
    }

    public string Derive(string sid)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sid);
        using var hmac = new HMACSHA256(key);
        return Base64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(sid)));
    }

    public static async Task<byte[]> LoadOrCreateKeyAsync(string path, CancellationToken cancellationToken = default)
    {
        if (File.Exists(path)) return await File.ReadAllBytesAsync(path, cancellationToken).ConfigureAwait(false);
        Directory.CreateDirectory(Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("Machine key path has no directory."));
        var key = RandomNumberGenerator.GetBytes(32);
        await MachineCredentialStore.AtomicWriteAsync(path, key, cancellationToken).ConfigureAwait(false);
        return key;
    }

    private static string Base64Url(byte[] value) => Convert.ToBase64String(value)
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');
}
