namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record RuntimePaths(
    string RootDirectory,
    string DatabasePath,
    string CredentialPath,
    string SettingsPath,
    string LogPath)
{
    public static RuntimePaths ForCurrentUser()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var root = Path.Combine(localAppData, "TimeOnChrome", "AppRuntime");
        return new RuntimePaths(
            root,
            Path.Combine(root, "runtime.db"),
            Path.Combine(root, "credential.dat"),
            Path.Combine(root, "runtime-settings.json"),
            Path.Combine(root, "runtime-agent.jsonl"));
    }
}
