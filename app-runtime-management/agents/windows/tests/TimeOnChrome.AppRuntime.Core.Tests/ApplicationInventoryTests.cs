using TimeOnChrome.AppRuntime.Core;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class ApplicationInventoryTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "runtime-inventory-" + Guid.NewGuid().ToString("N"));
    public ApplicationInventoryTests() => Directory.CreateDirectory(root);
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
