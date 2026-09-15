using System.Runtime.InteropServices;
using System.Text;

namespace TimeOnChrome.AppRuntime.Windows;

/// <summary>OS-confirmed package proof. Callers cannot construct one from a name or path.</summary>
public sealed class WindowsProcessPackageIdentity
{
    public string Aumid { get; }
    internal string ExecutablePath { get; }
    private WindowsProcessPackageIdentity(string aumid,string path) { Aumid=aumid; ExecutablePath=path; }
    internal static WindowsProcessPackageIdentity? Read(IntPtr process,string executablePath)
    {
        uint familyLength=0,applicationLength=0;
        if(GetPackageFamilyName(process,ref familyLength,null)!=122 || familyLength is 0 or > 256
            || GetApplicationUserModelId(process,ref applicationLength,null)!=122 || applicationLength is 0 or > 256)return null;
        var family=new StringBuilder((int)familyLength);
        var application=new StringBuilder((int)applicationLength);
        if(GetPackageFamilyName(process,ref familyLength,family)!=0 || GetApplicationUserModelId(process,ref applicationLength,application)!=0)return null;
        return IsApplicationInPackage(family.ToString(),application.ToString()) ? new(application.ToString(),executablePath) : null;
    }
    public static bool IsApplicationInPackage(string family,string aumid)=>family.Length>0 && family.Length<=255
        && aumid.Length<=255 && aumid.StartsWith(family+"!",StringComparison.Ordinal)
        && aumid.Length>family.Length+1 && !aumid.Contains('\\') && !aumid.Contains('/');
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]
    private static extern int GetPackageFamilyName(IntPtr process,ref uint length,StringBuilder? value);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]
    private static extern int GetApplicationUserModelId(IntPtr process,ref uint length,StringBuilder? value);
}
