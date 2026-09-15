using System.Text.RegularExpressions;
using System.Xml.Linq;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class InstallerPackageTests
{
    private const string ExpectedVersion = "2.2.1";
    private const string ExpectedUpgradeCode = "7DEBE72B-8D64-438F-8C51-8B9969C039D9";
    private static readonly XNamespace WixNamespace = "http://wixtoolset.org/schemas/v4/wxs";

    [Fact]
    public void ManagerComponentOwnsStartMenuAndPublicDesktopShortcuts()
    {
        var package = XDocument.Load(InstallerFile("Package.wxs"));
        var managerFile = package
            .Descendants(WixNamespace + "File")
            .Single(element => (string?)element.Attribute("Id") == "ManagerExecutableFile");
        var shortcuts = managerFile
            .Elements(WixNamespace + "Shortcut")
            .ToDictionary(element => (string)element.Attribute("Id")!, StringComparer.Ordinal);

        Assert.EndsWith(
            "TimeOnChrome.AppRuntime.Manager.exe",
            (string)managerFile.Attribute("Source")!,
            StringComparison.Ordinal);
        AssertShortcut(shortcuts["ManagerShortcut"], "ApplicationProgramsFolder");
        AssertShortcut(shortcuts["ManagerDesktopShortcut"], "DesktopFolder");
        Assert.Contains(
            package.Descendants(WixNamespace + "StandardDirectory"),
            element => (string?)element.Attribute("Id") == "DesktopFolder");
    }

    [Fact]
    public void MachineScopeUpgradeIdentityRemainsStable()
    {
        var package = XDocument.Load(InstallerFile("Package.wxs"))
            .Root?
            .Element(WixNamespace + "Package") ??
            throw new InvalidOperationException("Package element is missing.");

        Assert.Equal("perMachine", (string?)package.Attribute("Scope"));
        Assert.Equal(ExpectedUpgradeCode, (string?)package.Attribute("UpgradeCode"));
        Assert.NotNull(package.Element(WixNamespace + "MajorUpgrade"));
    }

    [Fact]
    public void InstallerAndBuildDefaultsUseCurrentProductVersion()
    {
        AssertProjectVersion("TimeOnChrome.AppRuntime.Installer.wixproj");
        AssertProjectVersion("TimeOnChrome.AppRuntime.Bundle.wixproj");

        var buildScript = File.ReadAllText(InstallerFile("build.ps1"));
        Assert.Matches(
            new Regex(@"\[string\]\$Version\s*=\s*'" + Regex.Escape(ExpectedVersion) + "'", RegexOptions.CultureInvariant),
            buildScript);
    }

    private static void AssertShortcut(XElement shortcut, string directory)
    {
        Assert.Equal("TimeWhereMg", (string?)shortcut.Attribute("Name"));
        Assert.Equal(directory, (string?)shortcut.Attribute("Directory"));
        Assert.Equal("yes", (string?)shortcut.Attribute("Advertise"));
    }

    private static void AssertProjectVersion(string fileName)
    {
        var project = XDocument.Load(InstallerFile(fileName));
        var version = project
            .Descendants("ProductVersion")
            .Single(element => (string?)element.Attribute("Condition") == "'$(ProductVersion)' == ''");

        Assert.Equal(ExpectedVersion, version.Value);
    }

    private static string InstallerFile(string fileName) =>
        Path.Combine(AppContext.BaseDirectory, "installer", fileName);
}
