using System.Diagnostics;
using TimeOnChrome.AppRuntime.Service;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class ServiceProcessLifecycleTests
{
    [Fact]
    public void ExitRegistrationTreatsAlreadyExitedProcessAsRetryableRace()
    {
        using var process = Process.Start(new ProcessStartInfo("cmd.exe", "/c exit 0")
        {
            CreateNoWindow = true,
            UseShellExecute = false,
        })!;
        process.WaitForExit();

        var callbackInvoked = false;
        var registered = AgentProcessRegistration.TryEnableExitEvents(process, (_, _) => callbackInvoked = true);

        Assert.False(registered);
        Assert.False(callbackInvoked);
    }
}
