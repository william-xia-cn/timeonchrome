using System.Diagnostics;

namespace TimeOnChrome.AppRuntime.Service;

internal static class AgentProcessRegistration
{
    public static bool TryEnableExitEvents(Process process, EventHandler handler)
    {
        var armed = 0;
        var delivered = 0;
        EventHandler? guardedHandler = null;
        guardedHandler = (sender, args) =>
        {
            if (Volatile.Read(ref armed) == 1 && Interlocked.Exchange(ref delivered, 1) == 0)
                handler(sender, args);
        };
        try
        {
            if (process.HasExited) return false;
            process.Exited += guardedHandler;
            process.EnableRaisingEvents = true;
            if (process.HasExited)
            {
                process.Exited -= guardedHandler;
                return false;
            }
            Volatile.Write(ref armed, 1);
            if (process.HasExited && Interlocked.Exchange(ref delivered, 1) == 0)
                handler(process, EventArgs.Empty);
            return true;
        }
        catch (InvalidOperationException)
        {
            // The short-lived process can exit between CreateProcessAsUser and registration.
        }
        catch (System.ComponentModel.Win32Exception)
        {
            // Treat an inaccessible/replaced process as unavailable and let supervision retry.
        }

        try { process.Exited -= guardedHandler; }
        catch (InvalidOperationException) { }
        return false;
    }
}
