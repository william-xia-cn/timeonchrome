namespace TimeOnChrome.AppRuntime.Windows;

internal sealed class ForegroundWinEventWatcher : IDisposable
{
    private readonly NativeMethods.WinEventDelegate callback;
    private readonly Action changed;
    private IntPtr hook;

    internal ForegroundWinEventWatcher(Action changed)
    {
        this.changed = changed;
        callback = HandleEvent;
        hook = NativeMethods.SetWinEventHook(
            NativeMethods.EventSystemForeground,
            NativeMethods.EventSystemForeground,
            IntPtr.Zero,
            callback,
            0,
            0,
            NativeMethods.WineventOutOfContext | NativeMethods.WineventSkipOwnProcess);

        if (hook == IntPtr.Zero)
        {
            throw new InvalidOperationException("Unable to register foreground WinEvent hook.");
        }
    }

    public void Dispose()
    {
        if (hook != IntPtr.Zero)
        {
            _ = NativeMethods.UnhookWinEvent(hook);
            hook = IntPtr.Zero;
        }
    }

    private void HandleEvent(
        IntPtr eventHook,
        uint eventType,
        IntPtr window,
        int objectId,
        int childId,
        uint eventThread,
        uint eventTime) => changed();
}
