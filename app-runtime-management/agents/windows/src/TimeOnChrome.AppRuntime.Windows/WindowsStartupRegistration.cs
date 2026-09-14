using Microsoft.Win32;

namespace TimeOnChrome.AppRuntime.Windows;

public interface IStartupRegistration
{
    void Register(string executablePath);

    void Remove();

    bool IsRegistered();
}

public sealed class WindowsStartupRegistration : IStartupRegistration
{
    internal const string RegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    internal const string ValueName = "TimeOnChromeAppRuntime";

    public void Register(string executablePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(executablePath);
        using var key = Registry.CurrentUser.CreateSubKey(RegistryPath, writable: true)
            ?? throw new InvalidOperationException("Unable to open current-user startup registry key.");
        key.SetValue(ValueName, BuildCommand(executablePath), RegistryValueKind.String);
    }

    public void Remove()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RegistryPath, writable: true);
        key?.DeleteValue(ValueName, throwOnMissingValue: false);
    }

    public bool IsRegistered()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RegistryPath, writable: false);
        return key?.GetValue(ValueName) is string;
    }

    internal static string BuildCommand(string executablePath) => $"\"{executablePath}\" run";
}
