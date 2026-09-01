namespace TimeOnChrome.AppRuntime.Setup;

internal enum SetupConnectionState
{
    Unpaired,
    Connecting,
    AwaitingFirstSync,
    Online,
    ConnectionIssue,
    RequiresPairing,
}

internal sealed record SetupConnectionPresentation(
    string Badge,
    string Heading,
    string Description,
    string Accent,
    string Surface,
    bool ShowPairing,
    bool PairingEnabled,
    bool ShowDetails,
    bool ShowRefresh,
    string CloseLabel,
    bool CloseEnabled);

internal static class SetupConnectionPresentations
{
    public static string DisplayAgentVersion(string version) =>
        Version.TryParse(version, out var parsed) && parsed.Revision == 0
            ? $"{parsed.Major}.{parsed.Minor}.{parsed.Build}"
            : version;

    public static SetupConnectionPresentation For(SetupConnectionState state) => state switch
    {
        SetupConnectionState.Unpaired => new(
            "未连接", "尚未连接这台电脑",
            "输入家长控制台生成的一次性配对码。未连接时不会采集或上传应用使用数据。",
            "#64748B", "#F8FAFC", true, true, false, false, "关闭", true),
        SetupConnectionState.Connecting => new(
            "连接中", "正在安全连接",
            "正在验证配对码并启动应用使用 Agent，请不要重复操作。",
            "#2563EB", "#EFF6FF", true, false, false, false, "正在连接…", false),
        SetupConnectionState.AwaitingFirstSync => new(
            "确认中", "已保存配对，正在确认 Agent",
            "Agent 已启动；首次 heartbeat 确认后，此处会自动变为在线。",
            "#D97706", "#FFFBEB", false, false, true, true, "关闭", true),
        SetupConnectionState.Online => new(
            "在线", "连接成功",
            "应用使用 Agent 正在后台运行。关闭此窗口不会停止采集与同步。",
            "#15803D", "#F0FDF4", false, false, true, true, "完成并关闭", true),
        SetupConnectionState.ConnectionIssue => new(
            "需检查", "连接暂时异常",
            "本地配对仍保留，但 Agent 尚未完成最近一次在线确认。请检查网络后重新检查。",
            "#B45309", "#FFF7ED", false, false, true, true, "关闭", true),
        SetupConnectionState.RequiresPairing => new(
            "需配对", "需要重新配对",
            "原连接已失效，或配对码无效、过期、已使用。请在家长控制台生成新配对码。",
            "#B91C1C", "#FEF2F2", true, true, false, false, "关闭", true),
        _ => throw new ArgumentOutOfRangeException(nameof(state), state, null),
    };
}
