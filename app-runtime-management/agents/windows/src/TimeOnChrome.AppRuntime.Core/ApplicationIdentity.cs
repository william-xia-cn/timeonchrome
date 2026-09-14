namespace TimeOnChrome.AppRuntime.Core;

public enum RuntimePlatform
{
    Macos,
    Windows,
}

public sealed record ApplicationIdentity(
    RuntimePlatform Platform,
    string RuntimeIdentity,
    string? DisplayName = null);
