namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record RuntimePaths(
    string RootDirectory,
    string DatabasePath,
    string CredentialPath,
    string SettingsPath,
    string LogPath)
{
    public static RuntimePaths ForCurrentUser(string? deviceId = null)
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var root = Path.Combine(localAppData, "TimeOnChrome", "AppRuntime");
        return new RuntimePaths(
            root,
            Path.Combine(root, deviceId is null ? "runtime-unbound.db" : $"runtime-{SafeDeviceId(deviceId)}.db"),
            Path.Combine(root, "credential.dat"),
            Path.Combine(root, "runtime-settings.json"),
            Path.Combine(root, "runtime-agent.jsonl"));
    }

    private static string SafeDeviceId(string deviceId)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(deviceId));
        return Convert.ToHexString(hash)[..16].ToLowerInvariant();
    }
}
