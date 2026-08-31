namespace TimeOnChrome.AppRuntime.Core;

public interface IRuntimeEventSource
{
    IAsyncEnumerable<RuntimeFact> FactsAsync(CancellationToken cancellationToken = default);
}
