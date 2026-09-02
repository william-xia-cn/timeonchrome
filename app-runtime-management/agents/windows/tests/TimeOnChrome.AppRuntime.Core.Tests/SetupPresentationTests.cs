using TimeOnChrome.AppRuntime.Setup;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class SetupPresentationTests
{
    [Theory]
    [InlineData(1920, 1040, 620, 680)]
    [InlineData(1280, 640, 620, 616)]
    [InlineData(960, 500, 620, 476)]
    public void WindowBoundsFitNormalAndHighDpiLogicalWorkAreas(
        double workAreaWidth,
        double workAreaHeight,
        double expectedWidth,
        double expectedHeight)
    {
        var bounds = SetupWindowLayout.Resolve(workAreaWidth, workAreaHeight);

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
        Assert.Throws<ArgumentOutOfRangeException>(() => SetupWindowLayout.Resolve(double.NaN, 800));
        Assert.Throws<ArgumentOutOfRangeException>(() => SetupWindowLayout.Resolve(319, 800));
        Assert.Throws<ArgumentOutOfRangeException>(() => SetupWindowLayout.Resolve(800, 239));
    }

    [Theory]
    [InlineData("1.0.1.0", "1.0.1")]
    [InlineData("1.0.1", "1.0.1")]
    [InlineData("dev", "dev")]
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
}
