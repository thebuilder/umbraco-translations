using System.Security.Cryptography;
using System.Text;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Sources;

namespace TheBuilder.Translations.Core.Synchronization;

public sealed class TranslationSyncEngine(
    ITranslationSourceTransport transport,
    ITranslationSourceParser parser,
    ITranslationSynchronizationStore store,
    TimeProvider timeProvider,
    TranslationSynchronizationLeasePolicy? leasePolicy = null)
{
    private readonly TranslationSynchronizationLeasePolicy _leasePolicy = leasePolicy ?? TranslationSynchronizationLeasePolicy.Default;

    public async Task<TranslationSyncResult> SynchronizeAsync(
        TranslationSourceDefinition source,
        CancellationToken cancellationToken)
    {
        if (!source.Enabled)
            throw new InvalidOperationException($"Translation source '{source.Alias}' is disabled.");

        var lease = await store.TryAcquireSynchronizationLeaseAsync(source, _leasePolicy.Duration, cancellationToken)
            ?? throw new TranslationSynchronizationInProgressException(source.Alias);
        using var synchronizationCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        Exception? leaseFailure = null;
        var leaseHeartbeat = RenewLeaseUntilCancelledAsync();
        var startedAt = timeProvider.GetUtcNow();
        try
        {
            source = await store.GetSynchronizationSourceAsync(lease, synchronizationCancellation.Token)
                ?? throw new TranslationSynchronizationInProgressException(source.Alias);
            if (!source.Enabled)
                throw new InvalidOperationException($"Translation source '{source.Alias}' is disabled.");
            var localeTasks = source.Parser.Locales.Select(locale => FetchLocaleAsync(source, locale, synchronizationCancellation.Token));
            var localeResults = await Task.WhenAll(localeTasks);
            var messages = localeResults.SelectMany(result => result.Messages).ToArray();
            if (messages.Length == 0)
                throw new TranslationSourceFormatException("The source produced no messages; the active snapshot was retained.");

            var revision = CombinedRevision(localeResults.Select(result => result.Revision));
            if (!await store.RenewSynchronizationLeaseAsync(lease, _leasePolicy.Duration, synchronizationCancellation.Token))
                throw new TranslationSynchronizationInProgressException(source.Alias);
            return await store.ApplySynchronizationAsync(source, lease, messages, revision, startedAt, synchronizationCancellation.Token);
        }
        catch (OperationCanceledException) when (leaseFailure is not null)
        {
            throw leaseFailure;
        }
        catch (TranslationSynchronizationInProgressException)
        {
            throw;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            var failed = new TranslationSyncResult(
                Guid.NewGuid(), source.Id, source.LastSuccessfulRevision ?? string.Empty,
                startedAt, timeProvider.GetUtcNow(), TranslationSyncStatus.Failed,
                0, 0, 0, exception is TranslationSourceFormatException ? 1 : 0, exception.Message);
            await store.RecordFailedSynchronizationAsync(failed, cancellationToken);
            throw;
        }
        finally
        {
            await synchronizationCancellation.CancelAsync();
            await leaseHeartbeat;
            await store.ReleaseSynchronizationLeaseAsync(lease, CancellationToken.None);
        }

        async Task RenewLeaseUntilCancelledAsync()
        {
            try
            {
                while (true)
                {
                    await Task.Delay(_leasePolicy.RenewalInterval, timeProvider, synchronizationCancellation.Token);
                    if (await store.RenewSynchronizationLeaseAsync(lease, _leasePolicy.Duration, synchronizationCancellation.Token))
                        continue;
                    leaseFailure = new TranslationSynchronizationInProgressException(source.Alias);
                    await synchronizationCancellation.CancelAsync();
                    return;
                }
            }
            catch (OperationCanceledException) when (synchronizationCancellation.IsCancellationRequested)
            {
            }
            catch (Exception exception)
            {
                leaseFailure = exception;
                await synchronizationCancellation.CancelAsync();
            }
        }
    }

    public async Task<TranslationSourceTestResult> TestAsync(
        TranslationSourceDefinition source,
        CancellationToken cancellationToken)
    {
        var localeTasks = source.Parser.Locales.Select(locale => FetchLocaleAsync(source, locale, cancellationToken));
        var localeResults = await Task.WhenAll(localeTasks);
        var messages = localeResults.SelectMany(result => result.Messages).ToArray();
        return new TranslationSourceTestResult(
            messages.Length > 0,
            CombinedRevision(localeResults.Select(result => result.Revision)),
            localeResults.Select(result => result.Locale).ToArray(),
            messages.Length,
            messages.Take(5).ToArray(),
            messages.Length == 0 ? ["The source produced no messages."] : []);
    }

    private async Task<LocaleResult> FetchLocaleAsync(
        TranslationSourceDefinition source,
        string locale,
        CancellationToken cancellationToken)
    {
        await using var payload = await transport.FetchAsync(source, new TranslationFetchContext(locale), cancellationToken);
        var messages = new List<TranslationSourceMessage>();
        await foreach (var message in parser.ParseAsync(payload, source.Parser, cancellationToken))
            messages.Add(message);
        return new LocaleResult(locale, payload.Revision, messages);
    }

    private static string CombinedRevision(IEnumerable<string> revisions)
    {
        var input = string.Join('\n', revisions.Order(StringComparer.Ordinal));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant();
    }

    private sealed record LocaleResult(string Locale, string Revision, IReadOnlyList<TranslationSourceMessage> Messages);
}

public sealed record TranslationSynchronizationLeasePolicy(TimeSpan Duration, TimeSpan RenewalInterval)
{
    public static TranslationSynchronizationLeasePolicy Default { get; } = new(TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(1));
}

public sealed class TranslationSynchronizationInProgressException(string sourceAlias)
    : InvalidOperationException($"Translation source '{sourceAlias}' is already being synchronized.");

public sealed record TranslationSourceTestResult(
    bool Success,
    string Revision,
    IReadOnlyList<string> Locales,
    int MessageCount,
    IReadOnlyList<TranslationSourceMessage> Sample,
    IReadOnlyList<string> Warnings);
