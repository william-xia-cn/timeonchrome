using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public static class SegmentCanonicalizer
{
    public static string ContentHash(UsageSegment segment)
    {
        ArgumentNullException.ThrowIfNull(segment);
        var canonical = string.Concat(
            Field(segment.RuntimeSessionID),
            Field(EnumWireName(segment.Application.Platform)),
            Field(segment.Application.RuntimeIdentity),
            Field(segment.Application.DisplayName),
            Field(segment.StartAtMs.ToString(CultureInfo.InvariantCulture)),
            Field(segment.EndAtMs.ToString(CultureInfo.InvariantCulture)),
            Field(segment.DurationMilliseconds.ToString(CultureInfo.InvariantCulture)),
            Field(EnumWireName(segment.EndReason)));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    private static string Field(string? value) => value is null
        ? "-1:"
        : string.Concat(value.Length.ToString(CultureInfo.InvariantCulture), ":", value);

    private static string EnumWireName<T>(T value)
        where T : struct, Enum
    {
        var name = value.ToString();
        return string.Concat(char.ToLowerInvariant(name[0]), name[1..]);
    }
}
