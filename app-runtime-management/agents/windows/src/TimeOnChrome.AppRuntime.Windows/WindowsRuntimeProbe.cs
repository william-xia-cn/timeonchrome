using System.Diagnostics;
using System.Text;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Windows;

public interface IWindowsRuntimeProbe
{
    ApplicationIdentity? GetForegroundApplication();

    TimeSpan GetIdleDuration();
}

public sealed class WindowsRuntimeProbe : IWindowsRuntimeProbe
{
    // Adapter-local only. Never included in a fact, inventory payload or log.
    public string? LastExecutablePath { get; private set; }
    public WindowsProcessPackageIdentity? LastPackageIdentity { get; private set; }
    public ApplicationIdentity? GetForegroundApplication()
    {
        LastExecutablePath = null;
        LastPackageIdentity = null;
        var window = NativeMethods.GetForegroundWindow();
        if (window == IntPtr.Zero)
        {
            return null;
        }

        _ = NativeMethods.GetWindowThreadProcessId(window, out var processId);
        if (processId == 0)
        {
            return null;
        }

        try
        {
            using var process = Process.GetProcessById(checked((int)processId));
            var displayName = process.ProcessName;
            var executablePath = TryGetExecutablePath(processId);
            LastExecutablePath = executablePath;
            return WindowsApplicationIdentityDeriver.Derive(executablePath, displayName);
        }
        catch (ArgumentException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    public TimeSpan GetIdleDuration()
    {
        var info = new NativeMethods.LastInputInfo
        {
            Size = checked((uint)System.Runtime.InteropServices.Marshal.SizeOf<NativeMethods.LastInputInfo>()),
        };

        if (!NativeMethods.GetLastInputInfo(ref info))
        {
            return TimeSpan.Zero;
        }

        var elapsed = unchecked((uint)Environment.TickCount - info.Time);
        return TimeSpan.FromMilliseconds(elapsed);
    }

    private string? TryGetExecutablePath(uint processId)
    {
        var process = NativeMethods.OpenProcess(
            NativeMethods.ProcessQueryLimitedInformation,
            inheritHandle: false,
            processId);
        if (process == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            var capacity = 32_768u;
            var buffer = new StringBuilder(checked((int)capacity));
            if(!NativeMethods.QueryFullProcessImageName(process, 0, buffer, ref capacity)) return null;
            var path=buffer.ToString();
            LastPackageIdentity=WindowsProcessPackageIdentity.Read(process,path);
            return path;
        }
        finally
        {
            _ = NativeMethods.CloseHandle(process);
        }
    }
}
