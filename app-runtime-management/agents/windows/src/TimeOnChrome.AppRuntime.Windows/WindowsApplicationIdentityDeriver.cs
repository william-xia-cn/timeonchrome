using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Windows;

public static class WindowsApplicationIdentityDeriver
{
    public static ApplicationIdentity Derive(string? executablePath, string processName, string? packageFamily = null, string? aumid = null)
    {
        var displayName = string.IsNullOrWhiteSpace(processName) ? "Windows application" : processName;
        string source;
        if (!string.IsNullOrWhiteSpace(packageFamily) && !string.IsNullOrWhiteSpace(aumid))
        {
            source = $"packaged:{packageFamily.Trim().ToUpperInvariant()}:{aumid.Trim().ToUpperInvariant()}";
        }
        else if (executablePath is not null && File.Exists(executablePath))
        {
            source = SignedOrBinarySource(executablePath);
        }
        else
        {
            source = $"process:{displayName.ToUpperInvariant()}";
        }
        return new ApplicationIdentity(RuntimePlatform.Windows, $"windows:{Hash(source)}", displayName);
    }

    private static string SignedOrBinarySource(string path)
    {
        try
        {
            using var certificate = new X509Certificate2(X509Certificate.CreateFromSignedFile(path));
            var version = FileVersionInfo.GetVersionInfo(path);
            var metadata = $"{version.OriginalFilename}|{version.ProductName}|{version.FileMajorPart}.{version.FileMinorPart}";
            return $"signed:{certificate.Thumbprint}:{metadata}";
        }
        catch (CryptographicException)
        {
            using var stream = File.OpenRead(path);
            return $"unsigned:{Convert.ToHexString(SHA256.HashData(stream))}";
        }
    }

    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
