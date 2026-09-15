using TimeOnChrome.AppRuntime.Core;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class ApplicationInventoryTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "runtime-inventory-" + Guid.NewGuid().ToString("N"));
    public ApplicationInventoryTests() => Directory.CreateDirectory(root);
    [Fact]
    public async Task PackageQueryUsesUtf8ForControlledChineseOutputWithoutDiscoveringApps()
    {
        var start = WindowsApplicationDiscovery.CreatePackageQueryStartInfo();
        Assert.False(start.UseShellExecute); Assert.True(start.CreateNoWindow);
        Assert.Equal("utf-8",start.StandardOutputEncoding!.WebName);
        Assert.StartsWith(WindowsApplicationDiscovery.PackageQueryEncodingCommand,start.ArgumentList[^1]);
        start.ArgumentList[^1] = WindowsApplicationDiscovery.PackageQueryEncodingCommand + "[Console]::Write('受控影音应用')";
        using var process = new System.Diagnostics.Process { StartInfo = start };
        Assert.True(process.Start());
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
        var errors = process.StandardError.ReadToEndAsync(timeout.Token);
        try { await process.WaitForExitAsync(timeout.Token); }
        finally { if (!process.HasExited) process.Kill(entireProcessTree:true); }
        Assert.Equal(0,process.ExitCode); Assert.Equal("",await errors);
        Assert.Equal("受控影音应用",await output);
    }
    [Fact]
    public void PackageEntriesKeepVisibleProductsSeparateAndResolveFriendlyNames()
    {
        const string xml = """
            <Package xmlns:uap="urn:fixture"><Applications>
              <Application Id="Main"><uap:VisualElements DisplayName="ms-resource:Name" /></Application>
              <Application Id="Video"><uap:VisualElements DisplayName="Fixture video" /></Application>
              <Application Id="Hidden"><uap:VisualElements DisplayName="ms-resource:Helper" AppListEntry="none" /></Application>
            </Applications></Package>
            """;
        foreach (var family in new[] { "MicrosoftWindows.Client.CBS_fixture", "MicrosoftWindows.Client.Core_fixture", "AppleInc.iCloud_fixture" })
        {
            var apps = WindowsApplicationDiscovery.ParsePackageManifest(xml, family, "Package name",
                new Dictionary<string,string> { [family + "!Main"] = "Fixture cloud" });
            Assert.Equal(3, apps.Count);
            Assert.Equal(3, apps.Select(item => item.Evidence.RuntimeIdentity).Distinct().Count());
            Assert.Equal("Fixture cloud", apps[0].Evidence.DisplayName);
            Assert.Equal("appList", apps[0].Evidence.Discovery!.NameSource);
            Assert.Equal("Fixture video", apps[1].Evidence.DisplayName);
            Assert.Equal("component", apps[2].Evidence.Discovery!.Role);
            Assert.Equal("fallback", apps[2].Evidence.Discovery!.NameSource);
        }
    }
    [Fact]
    public void RepeatedIdentityMergesSourcesButNotConflictingProofOrSameNameDifferentIdentity()
    {
        var a = new DiscoveredApplication(Observation().Evidence with { Discovery = new("application","installation",["registry"]) },"installed");
        var b = a with { Evidence = a.Evidence with { Discovery = new("application","appList",["shortcut"]), DisplayName = "Friendly name" } };
        var merged = WindowsApplicationDiscovery.MergeObservations([a,b]);
        Assert.Equal("Friendly name",merged.Evidence.DisplayName);
        Assert.Equal(new[] { "registry", "shortcut" },merged.Evidence.Discovery!.SourceKinds);
        Assert.Contains("binaryHash",merged.Evidence.VerifiedFields);
        Assert.Throws<InvalidDataException>(()=>WindowsApplicationDiscovery.MergeObservations([a,b with { Evidence=b.Evidence with { RuntimeIdentity="other" } }]));
        var conflict=b with { Evidence=b.Evidence with { Values=new Dictionary<string,string> { ["binaryHash"]=new('b',64) } } };
        Assert.DoesNotContain("binaryHash",WindowsApplicationDiscovery.MergeObservations([a,conflict]).Evidence.VerifiedFields);
    }
    [Fact]
    public async Task ScanReplayAndCompletionAreDurableEvenWhenCacheDoesNotChange()
    {
        var store = new MachineApplicationInventoryStore(Path.Combine(root,"scan.sqlite"),"machine-one");
        await store.InitializeAsync();
        var scan = new ApplicationInventoryScan(new('a',32),"opaque-user",0,1,1,[],false);
        var finish=scan with { BatchIndex=1,Completed=true };
        await Assert.ThrowsAsync<InvalidDataException>(()=>store.ObserveAsync([],scan:finish));
        await store.ObserveAsync([Observation()],scan:scan);
        await store.ObserveAsync([Observation()],scan:scan);
        var first=(await store.PeekAsync())!;
        await store.AcknowledgeAsync(first,new(first.BatchId,"accepted",1));
        await store.ObserveAsync([],scan:finish);
        var last=(await store.PeekAsync())!;
        Assert.True(last.Scan!.Completed); Assert.Empty(last.Observations);
        await store.AcknowledgeAsync(last,new(last.BatchId,"accepted",0));
        await store.ObserveAsync([Observation()],scan:scan with { ScanId=new('b',32) });
        Assert.NotNull(await store.PeekAsync());
        Assert.Equal(new[] { "opaque-app" },await store.ScanIdentitiesAsync(scan.ScanId));
        Assert.Single(await store.ListAsync());
    }
    [Fact]
    public async Task CompleteScanReconcilesMissingInstallsBeforeCompletionInSameOutboxTransaction()
    {
        var store=new MachineApplicationInventoryStore(Path.Combine(root,"reconcile-scan.sqlite"),"machine-one");
        await store.InitializeAsync();
        await store.ObserveAsync([Observation(),Observation("other-user")]);
        var first=(await store.PeekAsync())!;await store.AcknowledgeAsync(first,new(first.BatchId,"accepted",2));
        var end=new ApplicationInventoryScan(new('d',32),"opaque-user",0,0,0,[],true);
        await store.ObserveAsync([],scan:end);
        var absent=(await store.PeekAsync())!;Assert.Null(absent.Scan);
        Assert.Equal("notObserved",Assert.Single(absent.Observations).Status);
        await store.AcknowledgeAsync(absent,new(absent.BatchId,"accepted",1));
        Assert.True((await store.PeekAsync())!.Scan!.Completed);
        Assert.Equal("installed",(await store.ListAsync()).Single(item=>item.LocalUserId=="other-user").Status);
    }
    [Theory]
    [InlineData("\"C:\\Apps\\Game.exe\",0", "C:\\Apps\\Game.exe")]
    [InlineData("C:\\Apps\\Game.exe,-2", "C:\\Apps\\Game.exe")]
    [InlineData("C:\\Apps\\Icon.dll,0", null)]
    [InlineData("game.exe", null)]
    [InlineData("\"C:\\broken.exe", null)]
    public void DisplayIconParsingDoesNotExecuteCommands(string icon, string? expected) =>
        Assert.Equal(expected, WindowsApplicationDiscovery.ExecutableFromDisplayIcon(icon));

    [Theory]
    [InlineData("Fixture.Package_abc","Fixture.Package_abc!Game",true)]
    [InlineData("Fixture.Package_abc","Forged.Package!Game",false)]
    [InlineData("Fixture.Package_abc","Fixture.Package_abc!",false)]
    [InlineData("Fixture.Package_abc","Fixture.Package_abc!C:/private",false)]
    public void PackageProofRequiresOsFamilyAndMatchingAumid(string family,string aumid,bool expected)=>
        Assert.Equal(expected,WindowsProcessPackageIdentity.IsApplicationInPackage(family,aumid));

    private static MachineApplicationObservation Observation(string user = "opaque-user") => new(user,
        new AppEvidence("windows", "opaque-app", "Fixture game", new Dictionary<string,string> { ["binaryHash"] = new('a',64) }, ["binaryHash"]), "installed");
    [Fact]
    public async Task InventoryIsDurableIsolatedDeduplicatedAndAckValidated()
    {
        var path = Path.Combine(root,"inventory.sqlite");
        var store = new MachineApplicationInventoryStore(path,"machine-one");
        await store.InitializeAsync(); await store.ObserveAsync([Observation()]);
        var first = await store.PeekAsync(); Assert.NotNull(first);
        await store.ObserveAsync([Observation()]);
        Assert.Equal(first!.BatchId,(await store.PeekAsync())!.BatchId);
        await Assert.ThrowsAsync<InvalidDataException>(() => store.AcknowledgeAsync(first,new("wrong","accepted",1)));
        Assert.NotNull(await store.PeekAsync());
        var reopened = new MachineApplicationInventoryStore(path,"machine-one"); await reopened.InitializeAsync();
        Assert.Equal(first.BatchId,(await reopened.PeekAsync())!.BatchId);
        await reopened.AcknowledgeAsync(first,new(first.BatchId,"duplicate",1)); Assert.Null(await reopened.PeekAsync());
        Assert.Equal(Observation(),Assert.Single(await reopened.ListAsync()),new ObservationComparer());
        await reopened.ObserveAsync([Observation("other-user")]); Assert.NotNull(await reopened.PeekAsync());
        await Assert.ThrowsAsync<InvalidDataException>(() => new MachineApplicationInventoryStore(path,"other-machine").InitializeAsync());
    }
    private sealed class ObservationComparer : IEqualityComparer<MachineApplicationObservation>
    {
        public bool Equals(MachineApplicationObservation? a, MachineApplicationObservation? b) => a?.LocalUserId==b?.LocalUserId
            && a?.Evidence.RuntimeIdentity==b?.Evidence.RuntimeIdentity && a?.Status==b?.Status;
        public int GetHashCode(MachineApplicationObservation value)=>HashCode.Combine(value.LocalUserId,value.Evidence.RuntimeIdentity,value.Status);
    }
    [Fact]
    public async Task LocalMatcherAndPolicyCacheAreDurableWithoutActivatingUnapprovedCandidates()
    {
        var knowledge=new ApplicationKnowledge(1,1,[new AppProduct("game","Fixture game","game",
            [new AppProductSelector("windows",new AppMatchExpression("all",[new AppMatchCondition("binaryHash",new('a',64))]))])],[],
            [new ChildApplicationBinding("child-a",[new ChildProductClassification("game","restrictedEntertainment")],[])]);
        var quota=new AppPolicyQuotaConfig(new Dictionary<string,int?>(),null,[]);
        var document=new AppPolicyDocument(3,100,[],quota,ApplicationKnowledge:knowledge,
            ResolvedApplications:[new AppPolicyClassification(RuntimePlatform.Windows,"opaque-app","Fixture game",ApplicationClassification.RestrictedEntertainment)]);
        var policy=new MachinePolicy(9,"child-a",[new MachineUserAssignment("opaque-user",1,"child-a",true),new MachineUserAssignment("adult",1,null,false)],
            [new MachineChildAppPolicy("child-a",document)]);
        var results=MachinePolicyStore.ResolveApplications(policy,[Observation(),Observation("adult"),Observation("opaque-user") with {Evidence=Observation().Evidence with {RuntimeIdentity="new-candidate"}}]);
        Assert.Equal(2,results.Count);Assert.True(results[0].MatchesApprovedProjection);Assert.False(results[1].MatchesApprovedProjection);
        var store=new MachinePolicyStore(Path.Combine(root,"policy.json"));await store.SaveAsync(new AppliedMachinePolicy(policy,100,110,results));
        var restored=await store.LoadAsync();Assert.Equal(3,restored!.ApplicationResolutions![0].AppPolicyVersion);
        Assert.Equal("restrictedEntertainment",restored.ApplicationResolutions[0].Resolution.Classification);
        Assert.Equal(ApplicationClassification.Unclassified,MachinePolicyStore.SnapshotFor(policy,policy.Users[0],new ApplicationIdentity(RuntimePlatform.Windows,"new-candidate","Fixture game")).ApplicationClassification);
        Assert.True(MachinePolicyStore.RequiresAccountingBoundary(policy,policy with {AppPolicies=[new("child-a",document with {Version=4})]}));
    }
    [Fact]
    public async Task InvalidBatchRollsBackCacheAndOutboxTogether()
    {
        var store = new MachineApplicationInventoryStore(Path.Combine(root,"rollback.sqlite"),"machine"); await store.InitializeAsync();
        await Assert.ThrowsAsync<InvalidDataException>(() => store.ObserveAsync([Observation(),Observation("other") with {Status="uninstalled"}]));
        Assert.Null(await store.PeekAsync());
        await store.ObserveAsync([Observation()]); Assert.NotNull(await store.PeekAsync());
    }
    [Fact]
    public async Task CompleteScanOnlyReconcilesInstalledItemsOfAuthenticatedUserAndIsReplaySafe()
    {
        var store = new MachineApplicationInventoryStore(Path.Combine(root,"reconcile.sqlite"),"machine");
        await store.InitializeAsync();
        await store.ObserveAsync([Observation(), Observation("other"), Observation() with { Evidence = Observation().Evidence with { RuntimeIdentity = "portable" }, Status = "runtimeObserved" }]);
        var first = (await store.PeekAsync())!; await store.AcknowledgeAsync(first,new(first.BatchId,"accepted",3));
        await store.ObserveAsync([Observation() with { Status = "runtimeObserved" }]); Assert.Null(await store.PeekAsync());
        await store.ReconcileAsync("opaque-user",["opaque-app"]); Assert.Null(await store.PeekAsync());
        await Assert.ThrowsAsync<InvalidDataException>(()=>store.ReconcileAsync("opaque-user",[""]));
        await store.ReconcileAsync("opaque-user",[]);
        var update = (await store.PeekAsync())!; Assert.Equal("notObserved",Assert.Single(update.Observations).Status);
        await store.AcknowledgeAsync(update,new(update.BatchId,"accepted",1));
        await store.ReconcileAsync("opaque-user",[]); Assert.Null(await store.PeekAsync());
        var cached = await store.ListAsync(); Assert.Equal("installed",cached.Single(item=>item.LocalUserId=="other").Status);
        Assert.Equal("runtimeObserved",cached.Single(item=>item.Evidence.RuntimeIdentity=="portable").Status);
    }
    [Fact]
    public void LegacyAndFailedScanMessagesHaveNoAbsenceAuthority()
    {
        var legacy = new SessionApplicationInventoryMessage(3,[],"installed");
        Assert.Null(legacy.CompleteIdentitySet);
        Assert.Null(System.Text.Json.JsonSerializer.Deserialize<SessionApplicationInventoryMessage>("{\"schemaVersion\":3,\"applications\":[],\"status\":\"installed\"}",RuntimeJson.Options)!.CompleteIdentitySet);
    }
    public void Dispose() { if (Directory.Exists(root)) Directory.Delete(root,recursive:true); }
}
