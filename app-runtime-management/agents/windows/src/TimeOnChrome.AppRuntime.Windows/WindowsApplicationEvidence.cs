using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Windows;

public static class WindowsApplicationEvidence
{
    public static AppEvidence FromExecutable(string path, string? displayName = null, WindowsProcessPackageIdentity? packageIdentity = null)
    {
        // Hold the file against replacement while validating and hashing this observation.
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        var identity = WindowsApplicationIdentityDeriver.Derive(path, Path.GetFileNameWithoutExtension(path));
        var values = new Dictionary<string, string>(StringComparer.Ordinal)
        { ["binaryHash"] = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant() };
        var verified = new List<string> { "binaryHash" };
        if(packageIdentity is not null && string.Equals(Path.GetFullPath(path),Path.GetFullPath(packageIdentity.ExecutablePath),StringComparison.OrdinalIgnoreCase))
        {
            values["packageId"]=packageIdentity.Aumid;
            verified.Add("packageId");
        }
        var version = FileVersionInfo.GetVersionInfo(path);
        if (!string.IsNullOrWhiteSpace(version.ProductName)) values["productName"] = version.ProductName;
        if (AuthenticodeIsValid(path))
        {
            using var certificate = new X509Certificate2(X509Certificate.CreateFromSignedFile(path));
            values["signerKey"] = Hash(certificate.GetPublicKey());
            verified.Add("signerKey");
            // Metadata is a narrowing clue, never independently trusted identity.
        }
        return new AppEvidence("windows", identity.RuntimeIdentity,
            string.IsNullOrWhiteSpace(displayName) ? version.ProductName ?? identity.DisplayName ?? "Windows application" : displayName,
            values, verified);
    }

    public static string Hash(string value) => Hash(Encoding.UTF8.GetBytes(value));
    private static string Hash(byte[] value) => Convert.ToHexString(SHA256.HashData(value)).ToLowerInvariant();

    private static bool AuthenticodeIsValid(string path)
    {
        var file = new TrustFile { Size = (uint)Marshal.SizeOf<TrustFile>(), Path = path };
        var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<TrustFile>());
        Marshal.StructureToPtr(file, pointer, false);
        var data = new TrustData { Size = (uint)Marshal.SizeOf<TrustData>(), UiChoice = 2, UnionChoice = 1,
            File = pointer, StateAction = 1, ProviderFlags = 0x1000 }; // cache-only URL retrieval; never network during discovery
        var action = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
        try { return WinVerifyTrust(new IntPtr(-1), ref action, ref data) == 0; }
        finally
        {
            data.StateAction = 2;
            _ = WinVerifyTrust(new IntPtr(-1), ref action, ref data);
            Marshal.DestroyStructure<TrustFile>(pointer);
            Marshal.FreeHGlobal(pointer);
        }
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct TrustFile { public uint Size; [MarshalAs(UnmanagedType.LPWStr)] public string Path; public IntPtr FileHandle; public IntPtr KnownSubject; }
    [StructLayout(LayoutKind.Sequential)]
    private struct TrustData
    {
        public uint Size; public IntPtr PolicyCallback; public IntPtr SipClient; public uint UiChoice;
        public uint RevocationChecks; public uint UnionChoice; public IntPtr File; public uint StateAction;
        public IntPtr StateData; public IntPtr UrlReference; public uint ProviderFlags; public uint UiContext; public IntPtr SignatureSettings;
    }
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern int WinVerifyTrust(IntPtr window, ref Guid action, ref TrustData data);
}
