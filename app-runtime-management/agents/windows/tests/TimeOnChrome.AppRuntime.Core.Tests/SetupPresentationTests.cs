using TimeOnChrome.AppRuntime.Setup;
using TimeOnChrome.AppRuntime.Infrastructure;
using System.Text.Json;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class SetupPresentationTests
{
    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public void WindowCloseOnlyShutsDownNonTrayManager(bool keepInTray, bool shouldShutdown)
    {
        Assert.Equal(shouldShutdown, MainWindow.ShouldShutdownOnWindowClosed(keepInTray));
    }

    [Theory]
    [InlineData(1920, 1040, true, 760, 760)]
    [InlineData(1280, 640, true, 760, 616)]
    [InlineData(960, 500, true, 760, 476)]
    [InlineData(1920, 1040, false, 760, 520)]
    [InlineData(960, 500, false, 760, 476)]
    public void WindowBoundsFitNormalAndHighDpiLogicalWorkAreas(
        double workAreaWidth,
        double workAreaHeight,
        bool administrator,
        double expectedWidth,
        double expectedHeight)
    {
        var bounds = SetupWindowLayout.Resolve(workAreaWidth, workAreaHeight, administrator);

        Assert.Equal(expectedWidth, bounds.Width);
        Assert.Equal(expectedHeight, bounds.Height);
        Assert.True(bounds.Width <= workAreaWidth - SetupWindowLayout.WorkAreaMargin);
        Assert.True(bounds.Height <= workAreaHeight - SetupWindowLayout.WorkAreaMargin);
        Assert.True(bounds.MinWidth <= bounds.Width && bounds.Width <= bounds.MaxWidth);
        Assert.True(bounds.MinHeight <= bounds.Height && bounds.Height <= bounds.MaxHeight);
    }

    [Fact]
    public void WindowBoundsRejectInvalidOrUnsupportedWorkAreas()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => SetupWindowLayout.Resolve(double.NaN, 800, false));
        Assert.Throws<ArgumentOutOfRangeException>(() => SetupWindowLayout.Resolve(319, 800, false));
        Assert.Throws<ArgumentOutOfRangeException>(() => SetupWindowLayout.Resolve(800, 239, false));
    }

    [Fact]
    public void StandardWindowIsShorterThanAdministratorWindow()
    {
        var standard = SetupWindowLayout.Resolve(1920, 1040, false);
        var administrator = SetupWindowLayout.Resolve(1920, 1040, true);

        Assert.True(standard.Height < administrator.Height);
        Assert.Equal(SetupWindowLayout.PreferredStandardHeight, standard.Height);
        Assert.Equal(SetupWindowLayout.PreferredAdminHeight, administrator.Height);
    }

    [Theory]
    [InlineData("1.0.1.0", "1.0.1")]
    [InlineData("1.0.1", "1.0.1")]
    [InlineData("dev", "dev")]
    [InlineData("2.1.0.0", "2.1.0")]
    public void AgentVersionUsesProductFacingThreePartFormat(string value, string expected)
    {
        Assert.Equal(expected, SetupConnectionPresentations.DisplayAgentVersion(value));
    }

    [Theory]
    [InlineData(SetupConnectionState.Unpaired, true, true, false, false, "关闭", true)]
    [InlineData(SetupConnectionState.Connecting, true, false, false, false, "正在连接…", false)]
    [InlineData(SetupConnectionState.AwaitingFirstSync, false, false, true, true, "关闭", true)]
    [InlineData(SetupConnectionState.Online, false, false, true, true, "完成并关闭", true)]
    [InlineData(SetupConnectionState.ConnectionIssue, false, false, true, true, "关闭", true)]
    [InlineData(SetupConnectionState.RequiresPairing, true, true, false, false, "关闭", true)]
    internal void SetupStatesPreventRepeatedPairingAndExposeExpectedActions(
        SetupConnectionState state,
        bool showPairing,
        bool pairingEnabled,
        bool showDetails,
        bool showRefresh,
        string closeLabel,
        bool closeEnabled)
    {
        var presentation = SetupConnectionPresentations.For(state);

        Assert.Equal(showPairing, presentation.ShowPairing);
        Assert.Equal(pairingEnabled, presentation.PairingEnabled);
        Assert.Equal(showDetails, presentation.ShowDetails);
        Assert.Equal(showRefresh, presentation.ShowRefresh);
        Assert.Equal(closeLabel, presentation.CloseLabel);
        Assert.Equal(closeEnabled, presentation.CloseEnabled);
        Assert.False(string.IsNullOrWhiteSpace(presentation.Heading));
        Assert.False(string.IsNullOrWhiteSpace(presentation.Description));
    }

    [Fact]
    public void OnlineStateIsExplicitlyConfirmedInsteadOfCredentialOnly()
    {
        var online = SetupConnectionPresentations.For(SetupConnectionState.Online);
        var awaiting = SetupConnectionPresentations.For(SetupConnectionState.AwaitingFirstSync);

        Assert.Equal("连接成功", online.Heading);
        Assert.Contains("heartbeat", awaiting.Description, StringComparison.OrdinalIgnoreCase);
        Assert.NotEqual(online.Badge, awaiting.Badge);
        Assert.Equal("完成并关闭", online.CloseLabel);
        Assert.NotEqual(online.CloseLabel, awaiting.CloseLabel);
    }

    [Theory]
    [InlineData("unpaired", SetupConnectionState.Unpaired)]
    [InlineData("enrolled", SetupConnectionState.AwaitingFirstSync)]
    [InlineData("pendingPolicy", SetupConnectionState.AwaitingFirstSync)]
    [InlineData("online", SetupConnectionState.Online)]
    [InlineData("failed", SetupConnectionState.ConnectionIssue)]
    internal void ServiceResponseMapsToUnambiguousManagerState(
        string serviceState,
        SetupConnectionState expected)
    {
        Assert.Equal(expected, MainWindow.ConnectionStateForResponse(serviceState));
    }

    [Fact]
    public void PublicStatusWireShapeDoesNotExposeAdministrativeDiagnostics()
    {
        var json = JsonSerializer.Serialize(new MachinePublicStatusResponse(
            true, "online", ServiceVersion: "2.1.0", ServiceStartedAtMs: 100,
            LastHeartbeatSucceededAtMs: 200, HasPendingUploads: true), RuntimeJson.Options);

        Assert.Contains("lastHeartbeatSucceededAtMs", json, StringComparison.Ordinal);
        Assert.DoesNotContain("policyVersion", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("outbox", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("tamper", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("hasPendingUploads", json, StringComparison.Ordinal);
        Assert.DoesNotContain("errorCode\":null", json, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("ABCD-EFGH-JKLM", true)]
    [InlineData("abcd-efgh-jklm", false)]
    [InlineData("ABCD-EFGH-1JKL", false)]
    [InlineData("ABCD", false)]
    internal void PairingAndUninstallCodesUseTheFixedSafeFormat(string value, bool expected)
    {
        Assert.Equal(expected, MainWindow.IsCode(value));
    }

    [Fact]
    public void PublicStatusMappingLeavesAdministrativeFieldsEmpty()
    {
        var mapped = MainWindow.FromPublic(new MachinePublicStatusResponse(
            true, "online", ServiceVersion: "2.1.0", ServiceStartedAtMs: 10,
            LastHeartbeatSucceededAtMs: 20, HasPendingUploads: false));

        Assert.Equal(20, mapped.LastHeartbeatSucceededAtMs);
        Assert.Equal(0, mapped.AppliedPolicyVersion);
        Assert.Equal(0, mapped.UsageOutboxCount);
        Assert.Equal(0, mapped.TamperCount);
        Assert.Null(mapped.LastStableErrorCode);
    }

    [Fact]
    public void PublicPendingUploadFlagMapsWithoutExposingCounts()
    {
        var mapped = MainWindow.FromPublic(new MachinePublicStatusResponse(
            true, "online", HasPendingUploads: true));

        Assert.True(mapped.UsageOutboxCount > 0);
        Assert.Equal(0, mapped.MediaOutboxCount);
        Assert.Equal(0, mapped.LogOutboxCount);
    }
}
