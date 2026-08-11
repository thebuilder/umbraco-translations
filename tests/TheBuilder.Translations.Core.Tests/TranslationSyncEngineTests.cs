using System.Text;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Core.Tests;

public sealed class TranslationSyncEngineTests
{
    [Fact]
    public async Task Synchronizes_all_locales_into_one_atomic_store_call()
    {
        var source = Source(["da", "en"]);
        var transport = new FixtureTransport(new Dictionary<string, string>
        {
            ["da"] = """{"navigation":{"home":"Forside"},"greeting":"Hej {name}"}""",
            ["en"] = """{"navigation":{"home":"Home"},"greeting":"Hello {name}"}""",
        });
        var store = new RecordingStore();
        var engine = new TranslationSyncEngine(transport, new NestedJsonParser(new MessageFormatValidator()), store, TimeProvider.System);

        var result = await engine.SynchronizeAsync(source, CancellationToken.None);

        Assert.Equal(4, result.AddedCount);
        Assert.Equal(["da", "en"], store.Messages.Select(message => message.Locale).Distinct().Order());
        Assert.Single(store.AppliedRevisions);
        Assert.Empty(store.Failures);
    }

    [Fact]
    public async Task Empty_source_records_failure_without_replacing_active_snapshot()
    {
        var source = Source(["en"]);
        var transport = new FixtureTransport(new Dictionary<string, string> { ["en"] = "{}" });
        var store = new RecordingStore
        {
            Messages = [new("website", "existing", "en", "Existing", MessageFormat.Icu, new Dictionary<string, string>(), "checksum")],
        };
        var engine = new TranslationSyncEngine(transport, new NestedJsonParser(new MessageFormatValidator()), store, TimeProvider.System);

        await Assert.ThrowsAsync<TranslationSourceFormatException>(() => engine.SynchronizeAsync(source, CancellationToken.None));

        Assert.Equal("existing", Assert.Single(store.Messages).Key);
        Assert.Empty(store.AppliedRevisions);
        Assert.Equal(TranslationSyncStatus.Failed, Assert.Single(store.Failures).Status);
    }

    [Fact]
    public async Task Rejects_an_overlapping_synchronization_without_recording_a_failure()
    {
        var source = Source(["en"]);
        var store = new RecordingStore { LeaseAvailable = false };
        var engine = new TranslationSyncEngine(
            new FixtureTransport(new Dictionary<string, string> { ["en"] = "{}" }),
            new NestedJsonParser(new MessageFormatValidator()),
            store,
            TimeProvider.System);

        await Assert.ThrowsAsync<TranslationSynchronizationInProgressException>(() => engine.SynchronizeAsync(source, CancellationToken.None));

        Assert.Empty(store.Failures);
        Assert.Empty(store.AppliedRevisions);
    }

    [Fact]
    public async Task Cancels_fetch_and_does_not_apply_when_lease_renewal_is_lost()
    {
        var source = Source(["en"]);
        var store = new RecordingStore { RenewalAvailable = false };
        var engine = new TranslationSyncEngine(
            new BlockingTransport(),
            new NestedJsonParser(new MessageFormatValidator()),
            store,
            TimeProvider.System,
            new TranslationSynchronizationLeasePolicy(TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(10)));

        await Assert.ThrowsAsync<TranslationSynchronizationInProgressException>(() => engine.SynchronizeAsync(source, CancellationToken.None));

        Assert.Empty(store.AppliedRevisions);
        Assert.Empty(store.Failures);
    }

    private static TranslationSourceDefinition Source(IReadOnlyList<string> locales) => new(
        Guid.NewGuid(), "fixture", "Fixture", true,
        new("https://example.test/{locale}.json"),
        new(locales, "website"));

    private sealed class FixtureTransport(IReadOnlyDictionary<string, string> payloads) : ITranslationSourceTransport
    {
        public string Kind => "http";

        public Task<TranslationSourcePayload> FetchAsync(
            TranslationSourceDefinition source,
            TranslationFetchContext context,
            CancellationToken cancellationToken)
        {
            var json = payloads[context.Locale];
            TranslationSourcePayload payload = new(
                new MemoryStream(Encoding.UTF8.GetBytes(json)), context.Locale, "application/json", null, null, $"revision-{context.Locale}");
            return Task.FromResult(payload);
        }
    }

    private sealed class BlockingTransport : ITranslationSourceTransport
    {
        public string Kind => "http";

        public async Task<TranslationSourcePayload> FetchAsync(
            TranslationSourceDefinition source,
            TranslationFetchContext context,
            CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            throw new InvalidOperationException("The blocking transport should have been cancelled.");
        }
    }

    private sealed class RecordingStore : ITranslationSynchronizationStore
    {
        public IReadOnlyList<TranslationSourceMessage> Messages { get; set; } = [];
        public List<string> AppliedRevisions { get; } = [];
        public List<TranslationSyncResult> Failures { get; } = [];
        public bool LeaseAvailable { get; init; } = true;
        public bool RenewalAvailable { get; init; } = true;
        private TranslationSourceDefinition? _source;

        public Task<TranslationSynchronizationLease?> TryAcquireSynchronizationLeaseAsync(
            TranslationSourceDefinition source,
            TimeSpan duration,
            CancellationToken cancellationToken)
        {
            _source = source;
            return Task.FromResult(LeaseAvailable ? new TranslationSynchronizationLease(source.Id, Guid.NewGuid()) : null);
        }

        public Task<TranslationSourceDefinition?> GetSynchronizationSourceAsync(
            TranslationSynchronizationLease lease,
            CancellationToken cancellationToken) => Task.FromResult(_source);

        public Task ReleaseSynchronizationLeaseAsync(TranslationSynchronizationLease lease, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public Task<bool> RenewSynchronizationLeaseAsync(TranslationSynchronizationLease lease, TimeSpan duration, CancellationToken cancellationToken) =>
            Task.FromResult(RenewalAvailable);

        public Task<TranslationSyncResult> ApplySynchronizationAsync(
            TranslationSourceDefinition source,
            TranslationSynchronizationLease lease,
            IReadOnlyCollection<TranslationSourceMessage> messages,
            string revision,
            DateTimeOffset startedAt,
            CancellationToken cancellationToken)
        {
            Messages = messages.ToArray();
            AppliedRevisions.Add(revision);
            return Task.FromResult(new TranslationSyncResult(
                Guid.NewGuid(), source.Id, revision, startedAt, DateTimeOffset.UtcNow,
                TranslationSyncStatus.Succeeded, messages.Count, 0, 0, 0));
        }

        public Task RecordFailedSynchronizationAsync(TranslationSyncResult result, CancellationToken cancellationToken)
        {
            Failures.Add(result);
            return Task.CompletedTask;
        }
    }
}
