namespace TimeOnChrome.AppRuntime.Windows;

public static class WindowsRuntimeInstanceNames
{
    public const string AgentMutexName = "Local\\TimeOnChrome.AppRuntime.Agent.CurrentUser";
    public const string SetupMutexName = "Local\\TimeOnChrome.AppRuntime.Setup.CurrentUser";

    public static bool IsAgentRunning()
    {
        try
        {
            if (!Mutex.TryOpenExisting(AgentMutexName, out var mutex)) return false;
            mutex.Dispose();
            return true;
        }
        catch (UnauthorizedAccessException)
        {
            return true;
        }
    }
}
