namespace TimeOnChrome.AppRuntime.Setup;

public readonly record struct SetupWindowBounds(
    double Width,
    double Height,
    double MinWidth,
    double MinHeight,
    double MaxWidth,
    double MaxHeight);

public static class SetupWindowLayout
{
    public const double PreferredWidth = 760;
    public const double PreferredAdminHeight = 760;
    public const double PreferredStandardHeight = 520;
    public const double PreferredMinWidth = 420;
    public const double PreferredMinHeight = 360;
    public const double AbsoluteMinWidth = 320;
    public const double AbsoluteMinHeight = 240;
    public const double WorkAreaMargin = 24;

    public static SetupWindowBounds Resolve(double workAreaWidth, double workAreaHeight, bool administrator)
    {
        if (!double.IsFinite(workAreaWidth) || !double.IsFinite(workAreaHeight)
            || workAreaWidth < AbsoluteMinWidth || workAreaHeight < AbsoluteMinHeight)
        {
            throw new ArgumentOutOfRangeException(nameof(workAreaWidth), "Windows work area is too small or invalid.");
        }

        var maxWidth = Math.Max(AbsoluteMinWidth, workAreaWidth - WorkAreaMargin);
        var maxHeight = Math.Max(AbsoluteMinHeight, workAreaHeight - WorkAreaMargin);
        var minWidth = Math.Min(PreferredMinWidth, maxWidth);
        var minHeight = Math.Min(PreferredMinHeight, maxHeight);

        return new SetupWindowBounds(
            Math.Clamp(PreferredWidth, minWidth, maxWidth),
            Math.Clamp(administrator ? PreferredAdminHeight : PreferredStandardHeight, minHeight, maxHeight),
            minWidth,
            minHeight,
            maxWidth,
            maxHeight);
    }
}
