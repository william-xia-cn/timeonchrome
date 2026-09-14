namespace TimeOnChrome.AppRuntime.Windows;

public static class WindowsRuntimeInstanceNames
{
    public const string AgentMutexName = "Local\\TimeOnChrome.AppRuntime.Agent.CurrentUser";
    public const string ManagerMutexName = "Local\\TimeOnChrome.AppRuntime.Manager.CurrentSession";
    public const string ManagerAdminMutexName = "Local\\TimeOnChrome.AppRuntime.Manager.Admin.CurrentSession";
    public const string ManagerActivationEventName = "Local\\TimeOnChrome.AppRuntime.Manager.Activate";

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
