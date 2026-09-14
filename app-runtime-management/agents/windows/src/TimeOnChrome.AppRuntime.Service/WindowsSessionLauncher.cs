using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace TimeOnChrome.AppRuntime.Service;

internal sealed record InteractiveSession(int SessionId, string Sid, string DisplayName, bool Active);

internal sealed class WindowsSessionLauncher
{
    private const int WtsCurrentServerHandle = 0;
    private const uint NormalPriorityClass = 0x00000020;
    private const uint CreateUnicodeEnvironment = 0x00000400;

    public IReadOnlyList<InteractiveSession> Enumerate()
    {
        if (!WTSEnumerateSessions((nint)WtsCurrentServerHandle, 0, 1, out var buffer, out var count))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        try
        {
            var result = new List<InteractiveSession>();
            var size = Marshal.SizeOf<WtsSessionInfo>();
            for (var index = 0; index < count; index += 1)
            {
                var info = Marshal.PtrToStructure<WtsSessionInfo>(buffer + (index * size));
                var user = QueryString(info.SessionId, WtsInfoClass.UserName);
                if (string.IsNullOrWhiteSpace(user)) continue;
                if (!WTSQueryUserToken((uint)info.SessionId, out var token)) continue;
                try
                {
                    using var identity = new System.Security.Principal.WindowsIdentity(token);
                    var sid = identity.User?.Value;
                    if (string.IsNullOrWhiteSpace(sid) || identity.IsSystem || identity.IsGuest) continue;
                    var domain = QueryString(info.SessionId, WtsInfoClass.DomainName);
                    result.Add(new InteractiveSession(
                        info.SessionId,
                        sid,
                        string.IsNullOrWhiteSpace(domain) ? user : $"{domain}\\{user}",
                        info.State == WtsConnectState.Active));
                }
                finally
                {
                    _ = CloseHandle(token);
                }
            }
            return result;
        }
        finally
        {
            WTSFreeMemory(buffer);
        }
    }

    public Process Start(int sessionId, string executablePath)
    {
        if (!WTSQueryUserToken((uint)sessionId, out var token)) throw new Win32Exception(Marshal.GetLastWin32Error());
        nint environment = 0;
        try
        {
            if (!CreateEnvironmentBlock(out environment, token, false)) throw new Win32Exception(Marshal.GetLastWin32Error());
            var startup = new StartupInfo { Size = Marshal.SizeOf<StartupInfo>(), Desktop = "winsta0\\default" };
            var commandLine = $"\"{executablePath}\"";
            if (!CreateProcessAsUser(token, executablePath, commandLine, 0, 0, false,
                NormalPriorityClass | CreateUnicodeEnvironment, environment,
                Path.GetDirectoryName(executablePath), ref startup, out var processInfo))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }
            _ = CloseHandle(processInfo.Thread);
            _ = CloseHandle(processInfo.Process);
            return Process.GetProcessById(checked((int)processInfo.ProcessId));
        }
        finally
        {
            if (environment != 0) _ = DestroyEnvironmentBlock(environment);
            _ = CloseHandle(token);
        }
    }

    private static string QueryString(int sessionId, WtsInfoClass infoClass)
    {
        if (!WTSQuerySessionInformation((nint)WtsCurrentServerHandle, sessionId, infoClass, out var value, out _)) return string.Empty;
        try { return Marshal.PtrToStringUni(value) ?? string.Empty; }
        finally { WTSFreeMemory(value); }
    }

    private enum WtsInfoClass { UserName = 5, DomainName = 7 }
    private enum WtsConnectState { Active = 0, Connected = 1, ConnectQuery = 2, Shadow = 3, Disconnected = 4, Idle = 5, Listen = 6, Reset = 7, Down = 8, Init = 9 }

    [StructLayout(LayoutKind.Sequential)]
    private struct WtsSessionInfo { public int SessionId; public nint WinStationName; public WtsConnectState State; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size;
        public string? Reserved;
        public string? Desktop;
        public string? Title;
        public int X;
        public int Y;
        public int XSize;
        public int YSize;
        public int XCountChars;
        public int YCountChars;
        public int FillAttribute;
        public int Flags;
        public short ShowWindow;
        public short Reserved2;
        public nint Reserved2Pointer;
        public nint StandardInput;
        public nint StandardOutput;
        public nint StandardError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation { public nint Process; public nint Thread; public uint ProcessId; public uint ThreadId; }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSEnumerateSessions(nint server, int reserved, int version, out nint sessionInfo, out int count);

    [DllImport("wtsapi32.dll", EntryPoint = "WTSQuerySessionInformationW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSQuerySessionInformation(nint server, int sessionId, WtsInfoClass infoClass, out nint buffer, out int bytesReturned);

    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(nint memory);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSQueryUserToken(uint sessionId, out nint token);

    [DllImport("userenv.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateEnvironmentBlock(out nint environment, nint token, [MarshalAs(UnmanagedType.Bool)] bool inherit);

    [DllImport("userenv.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyEnvironmentBlock(nint environment);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateProcessAsUser(
        nint token, string? applicationName, string commandLine, nint processAttributes, nint threadAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool inheritHandles, uint creationFlags, nint environment,
        string? currentDirectory, ref StartupInfo startupInfo, out ProcessInformation processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(nint handle);
}
