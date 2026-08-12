using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;
using TheBuilder.Translations.Core.Output;
using Umbraco.Cms.Infrastructure.Scoping;

namespace TheBuilder.Translations.Persistence;

internal sealed class UmbracoTranslationStore(
    IScopeProvider scopeProvider,
    ITranslationSnapshotChangePublisher snapshotChanges,
    TimeProvider timeProvider)
    : ITranslationSourceRepository, ITranslationSynchronizationStore, ITranslationMessageRepository, ITranslationEditorRepository
{
    public Task<TranslationMessageView> EnsureMessageAsync(MessageIdentity identity, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope();
        var existing = scope.Database.SingleOrDefault<MessageRow>(
            $"SELECT * FROM {Constants.Tables.Messages} WHERE SourceId = @0 AND Namespace = @1 AND [Key] = @2 AND Locale = @3",
            identity.SourceId, identity.Namespace, identity.Key, identity.Locale);
        if (existing is not null)
        {
            var current = scope.Database.SingleOrDefaultById<OverrideRow>(existing.Id);
            scope.Complete();
            return Task.FromResult(new TranslationMessageView(
                TranslationRowMapper.ToDomain(existing),
                current is null ? null : TranslationRowMapper.ToDomain(current)));
        }

        // The key has to exist in some locale: an editor translates a key the application defined,
        // not one they invented. Any shipped locale carries the same format and argument signature,
        // so the new row inherits its shape rather than starting with none -- otherwise argument
        // validation would reject the very placeholders the message requires.
        var shape = scope.Database.FirstOrDefault<MessageRow>(
            $"SELECT * FROM {Constants.Tables.Messages} WHERE SourceId = @0 AND Namespace = @1 AND [Key] = @2 AND State <> @3 ORDER BY Locale",
            identity.SourceId, identity.Namespace, identity.Key, TranslationMessageState.Authored.ToString())
            ?? throw new KeyNotFoundException(
                $"Translation key '{identity.Namespace}.{identity.Key}' was not found for source '{identity.SourceId}'.");

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var row = new MessageRow
        {
            Id = Guid.NewGuid(),
            SourceId = identity.SourceId,
            Namespace = identity.Namespace,
            Key = identity.Key,
            Locale = identity.Locale,
            // No application default exists for this locale; the override carries the whole text.
            DefaultValue = string.Empty,
            // Format and arguments are properties of the key, so they come from a shipped locale.
            Format = shape.Format,
            ArgumentSignature = shape.ArgumentSignature,
            SourceRevision = shape.SourceRevision,
            // Deliberately the checksum of this row's own empty default, not the shipped locale's.
            // Review state is per locale: an override is stale when the default it was written
            // against changes. There is no default here, so it never goes stale, whereas inheriting
            // another locale's checksum would leave the two permanently mismatched and flag every
            // authored translation for review the moment it was saved.
            DefaultChecksum = TranslationMessageFingerprint.Compute(
                string.Empty,
                Enum.Parse<MessageFormat>(shape.Format),
                TranslationRowMapper.DeserializeArguments(shape.ArgumentSignature)),
            FirstSeenAt = now,
            LastSeenAt = now,
            State = TranslationMessageState.Authored.ToString(),
        };
        scope.Database.Insert(row);
        scope.Complete();
        return Task.FromResult(new TranslationMessageView(TranslationRowMapper.ToDomain(row), null));
    }

    public Task<IReadOnlyList<string>> GetLocalesAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        return Task.FromResult<IReadOnlyList<string>>(scope.Database.Fetch<string>(
            $"SELECT DISTINCT Locale FROM {Constants.Tables.Messages} WHERE State <> @0 ORDER BY Locale",
            TranslationMessageState.Missing.ToString()));
    }

    public Task<Core.Persistence.Page<TranslationMessageKeyView>> QueryKeysAsync(MessageKeyQuery query, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        MessageQueryValidation.Ensure(query.Page, query.PageSize);
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        return Task.FromResult(TranslationKeyQueries.QueryKeys(scope.Database, query));
    }

    public Task<IReadOnlyList<MessageKeyReference>> QueryKeyReferencesAsync(MessageKeyQuery query, int limit, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        return Task.FromResult(TranslationKeyQueries.QueryKeyReferences(scope.Database, query, limit));
    }

    public Task<TranslationSynchronizationLease?> TryAcquireSynchronizationLeaseAsync(
        TranslationSourceDefinition source,
        TimeSpan duration,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var now = timeProvider.GetUtcNow();
        using var scope = scopeProvider.CreateScope();
        var lease = TranslationSynchronizationLeases.TryAcquire(scope.Database, source.Id, now, duration);
        scope.Complete();
        return Task.FromResult(lease);
    }

    public Task<TranslationSourceDefinition?> GetSynchronizationSourceAsync(
        TranslationSynchronizationLease lease,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        var row = scope.Database.SingleOrDefault<SourceRow>($"SELECT * FROM {Constants.Tables.Sources} WHERE Id = @0 AND SyncLeaseId = @1", lease.SourceId, lease.LeaseId);
        return Task.FromResult(row is null ? null : TranslationRowMapper.ToDomain(row));
    }

    public Task ReleaseSynchronizationLeaseAsync(
        TranslationSynchronizationLease lease,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope();
        TranslationSynchronizationLeases.Release(scope.Database, lease);
        scope.Complete();
        return Task.CompletedTask;
    }

    public Task<bool> RenewSynchronizationLeaseAsync(
        TranslationSynchronizationLease lease,
        TimeSpan duration,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope();
        var renewed = TranslationSynchronizationLeases.Renew(scope.Database, lease, timeProvider.GetUtcNow(), duration);
        scope.Complete();
        return Task.FromResult(renewed);
    }

    public Task<IReadOnlyList<TranslationSourceDefinition>> GetSourcesAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        var rows = scope.Database.Fetch<SourceRow>($"SELECT * FROM {Constants.Tables.Sources} ORDER BY DisplayName");
        return Task.FromResult<IReadOnlyList<TranslationSourceDefinition>>(rows.Select(TranslationRowMapper.ToDomain).ToArray());
    }

    public Task<TranslationSourceDefinition?> GetSourceAsync(Guid sourceId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        var row = scope.Database.SingleOrDefaultById<SourceRow>(sourceId);
        return Task.FromResult(row is null ? null : TranslationRowMapper.ToDomain(row));
    }

    public Task<TranslationSourceDefinition?> GetSourceByAliasAsync(string alias, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        var row = scope.Database.SingleOrDefault<SourceRow>($"SELECT * FROM {Constants.Tables.Sources} WHERE Alias = @0", alias);
        return Task.FromResult(row is null ? null : TranslationRowMapper.ToDomain(row));
    }

    public Task SaveSourceAsync(TranslationSourceDefinition source, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        TranslationSourceValidator.EnsureValid(source);
        using var scope = scopeProvider.CreateScope();
        var existing = scope.Database.SingleOrDefaultById<SourceRow>(source.Id);
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var row = TranslationRowMapper.ToRow(source, existing?.CreatedAt ?? now, now);
        row.SyncLeaseId = existing?.SyncLeaseId;
        row.SyncLeaseExpiresAt = existing?.SyncLeaseExpiresAt;
        if (existing is null)
            scope.Database.Insert(row);
        else
        {
            var updated = TranslationSourceConfiguration.TryUpdate(scope.Database, row, now);
            if (!updated)
                throw new TranslationSynchronizationInProgressException(source.Alias);
        }
        scope.Complete();
        return Task.CompletedTask;
    }

    public Task DeleteSourceAsync(Guid sourceId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope();
        var source = scope.Database.SingleOrDefaultById<SourceRow>(sourceId);
        if (source is null)
            return Task.CompletedTask;

        TranslationSourceDeletion.Delete(scope.Database, sourceId);
        scope.Complete();
        snapshotChanges.Publish(sourceId);
        return Task.CompletedTask;
    }

    public Task<TranslationSyncResult> ApplySynchronizationAsync(
        TranslationSourceDefinition source,
        TranslationSynchronizationLease lease,
        IReadOnlyCollection<TranslationSourceMessage> messages,
        string revision,
        DateTimeOffset startedAt,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var now = timeProvider.GetUtcNow();
        using var scope = scopeProvider.CreateScope();
        var persistedSource = scope.Database.SingleOrDefaultById<SourceRow>(source.Id);
        if (persistedSource is null)
            throw new InvalidOperationException($"Translation source '{source.Alias}' was deleted before synchronization completed.");
        if (persistedSource.SyncLeaseId != lease.LeaseId)
            throw new TranslationSynchronizationInProgressException(source.Alias);
        var current = scope.Database.Fetch<MessageRow>($"SELECT * FROM {Constants.Tables.Messages} WHERE SourceId = @0", source.Id);
        var incomingIdentities = new HashSet<MessageIdentity>();
        foreach (var incoming in messages)
        {
            if (!incomingIdentities.Add(new(source.Id, incoming.Namespace, incoming.Key, incoming.Locale)))
                throw new TranslationSourceFormatException($"Duplicate source message '{incoming.Namespace}.{incoming.Key}' for locale '{incoming.Locale}'.");
        }
        var currentMessages = current.Select(TranslationRowMapper.ToDomain).ToArray();
        var diff = TranslationDiff.Between(source.Id, currentMessages, messages);
        var addedIdentities = diff.Added.Select(message => new MessageIdentity(source.Id, message.Namespace, message.Key, message.Locale)).ToHashSet();
        var changedIdentities = diff.Changed.Select(message => new MessageIdentity(source.Id, message.Namespace, message.Key, message.Locale)).ToHashSet();
        var missingIds = diff.Missing.Select(message => message.Id).ToHashSet();
        var overriddenIds = scope.Database.Fetch<Guid>($"""
            SELECT o.MessageId
            FROM {Constants.Tables.Overrides} o
            INNER JOIN {Constants.Tables.Messages} m ON m.Id = o.MessageId
            WHERE m.SourceId = @0
            """, source.Id).ToHashSet();
        var currentByIdentity = current.ToDictionary(row => new MessageIdentity(row.SourceId, row.Namespace, row.Key, row.Locale));
        var added = 0;
        var changed = 0;

        foreach (var incoming in messages)
        {
            var identity = new MessageIdentity(source.Id, incoming.Namespace, incoming.Key, incoming.Locale);
            if (addedIdentities.Contains(identity))
            {
                scope.Database.Insert(TranslationRowMapper.ToRow(source.Id, incoming, revision, now.UtcDateTime));
                added++;
                continue;
            }

            var row = currentByIdentity[identity];
            var defaultChanged = changedIdentities.Contains(identity);
            var wasMissing = Enum.Parse<TranslationMessageState>(row.State) is TranslationMessageState.Missing;
            if (!defaultChanged && !wasMissing && row.SourceRevision == revision)
                continue;

            row.PreviousDefaultChecksum = defaultChanged ? row.DefaultChecksum : row.PreviousDefaultChecksum;
            row.DefaultValue = incoming.Value;
            row.Format = incoming.Format.ToString();
            row.ArgumentSignature = TranslationRowMapper.SerializeArguments(incoming.Arguments);
            row.SourceRevision = revision;
            // Keep legacy value-only fingerprints stable until the message actually changes so existing
            // overrides are not marked for review merely because the fingerprint algorithm was upgraded.
            row.DefaultChecksum = defaultChanged ? incoming.Checksum : row.DefaultChecksum;
            row.LastSeenAt = now.UtcDateTime;
            row.State = defaultChanged ? TranslationMessageState.Changed.ToString() : TranslationMessageState.Active.ToString();
            scope.Database.Update(row);
            changed += defaultChanged ? 1 : 0;
        }

        var missing = 0;
        foreach (var row in current.Where(row => missingIds.Contains(row.Id)))
        {
            var state = Enum.Parse<TranslationMessageState>(row.State);
            switch (RemovedMessageRetention.Decide(state, overriddenIds.Contains(row.Id)))
            {
                case RemovedMessageAction.Delete:
                    scope.Database.Delete(row);
                    missing += state is TranslationMessageState.Missing ? 0 : 1;
                    break;
                case RemovedMessageAction.Tombstone:
                    row.State = TranslationMessageState.Missing.ToString();
                    scope.Database.Update(row);
                    missing++;
                    break;
                case RemovedMessageAction.None:
                    break;
            }
        }

        if (!TranslationSynchronizationFencing.TryComplete(scope.Database, source.Id, lease.LeaseId, revision, now.UtcDateTime))
            throw new TranslationSynchronizationInProgressException(source.Alias);

        var result = new TranslationSyncResult(
            Guid.NewGuid(), source.Id, revision, startedAt, now,
            TranslationSyncStatus.Succeeded, added, changed, missing, 0);
        scope.Database.Insert(TranslationRowMapper.ToRow(result));
        scope.Complete();
        snapshotChanges.Publish(source.Id);
        return Task.FromResult(result);
    }

    public Task RecordFailedSynchronizationAsync(TranslationSyncResult result, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope();
        TranslationSynchronizationHistory.TryInsertFailure(scope.Database, TranslationRowMapper.ToRow(result));
        scope.Complete();
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<TranslationSyncResult>> GetSyncHistoryAsync(Guid sourceId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        var rows = scope.Database.Fetch<SyncRow>($"SELECT * FROM {Constants.Tables.Syncs} WHERE SourceId = @0 ORDER BY StartedAt DESC", sourceId);
        return Task.FromResult<IReadOnlyList<TranslationSyncResult>>(rows.Select(TranslationRowMapper.ToDomain).ToArray());
    }

    public Task<IReadOnlyList<TranslationSourceStatus>> GetSourceStatusesAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var now = timeProvider.GetUtcNow();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        var sources = scope.Database.Fetch<SourceRow>($"SELECT * FROM {Constants.Tables.Sources}");
        // Newest run per source. Sync history is small, so a single ordered fetch beats N queries.
        var latest = scope.Database
            .Fetch<SyncRow>($"SELECT * FROM {Constants.Tables.Syncs} ORDER BY StartedAt DESC")
            .GroupBy(row => row.SourceId)
            .ToDictionary(group => group.Key, group => TranslationRowMapper.ToDomain(group.First()));

        return Task.FromResult<IReadOnlyList<TranslationSourceStatus>>(sources
            .Select(source => new TranslationSourceStatus(
                source.Id,
                // An expired lease means the previous run died. Ignoring expiry here would pin the
                // editor into a permanent "syncing" state that no user action could clear.
                source.SyncLeaseId is not null && source.SyncLeaseExpiresAt > now.UtcDateTime,
                source.SyncLeaseExpiresAt,
                latest.GetValueOrDefault(source.Id)))
            .ToArray());
    }

    public Task<Core.Persistence.Page<TranslationMessageView>> QueryMessagesAsync(MessageQuery query, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Validate(query);
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        var sql = TranslationSql.Messages(query);
        var page = scope.Database.Page<MessageViewRow>(query.Page, query.PageSize, sql);
        return Task.FromResult(new Core.Persistence.Page<TranslationMessageView>(page.Items.Select(TranslationRowMapper.ToDomain).ToArray(), query.Page, query.PageSize, checked((int)page.TotalItems)));
    }

    public Task<TranslationMessageView?> GetMessageAsync(Guid messageId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        var row = scope.Database.SingleOrDefault<MessageViewRow>(TranslationSql.MessageSelect + " WHERE m.Id = @0", messageId);
        return Task.FromResult(row is null ? null : TranslationRowMapper.ToDomain(row));
    }

    public Task<TranslationFacetData> GetFacetDataAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        return Task.FromResult(TranslationFacetQueries.Read(scope.Database));
    }

    public Task<TranslationOverride> SaveOverrideAsync(
        Guid messageId,
        string value,
        long? expectedVersion,
        string userId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope();
        var message = scope.Database.SingleOrDefaultById<MessageRow>(messageId)
            ?? throw new KeyNotFoundException($"Translation message '{messageId}' was not found.");
        var existing = scope.Database.SingleOrDefaultById<OverrideRow>(messageId);
        EnsureVersion(existing?.Version, expectedVersion);
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var row = new OverrideRow
        {
            MessageId = messageId,
            Value = value,
            SourceChecksumAtEdit = message.DefaultChecksum,
            Version = (existing?.Version ?? 0) + 1,
            CreatedAt = existing?.CreatedAt ?? now,
            CreatedBy = existing?.CreatedBy ?? userId,
            UpdatedAt = now,
            UpdatedBy = userId,
        };
        if (existing is null)
            scope.Database.Insert(row);
        else
            scope.Database.Update(row);
        scope.Complete();
        snapshotChanges.Publish(message.SourceId);
        return Task.FromResult(TranslationRowMapper.ToDomain(row));
    }

    public Task DeleteOverrideAsync(Guid messageId, long? expectedVersion, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope();
        var existing = scope.Database.SingleOrDefaultById<OverrideRow>(messageId);
        if (existing is null)
            return Task.CompletedTask;
        EnsureVersion(existing.Version, expectedVersion);
        var message = scope.Database.SingleById<MessageRow>(messageId);
        scope.Database.Delete(existing);
        if (RemovedMessageRetention.DeleteAfterOverrideReset(Enum.Parse<TranslationMessageState>(message.State)))
            scope.Database.Delete(message);
        scope.Complete();
        snapshotChanges.Publish(message.SourceId);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<TranslationMessageView>> GetOutputMessagesAsync(
        string locale,
        string messageNamespace,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var scope = scopeProvider.CreateScope(autoComplete: true);
        var sql = TranslationSql.OutputMessages(locale, messageNamespace);
        var rows = scope.Database.Fetch<MessageViewRow>(sql);
        return Task.FromResult<IReadOnlyList<TranslationMessageView>>(rows.Select(TranslationRowMapper.ToDomain).ToArray());
    }

    private static void Validate(MessageQuery query) => MessageQueryValidation.Ensure(query);

    private static void EnsureVersion(long? current, long? expected)
    {
        if (expected is not null && current != expected)
            throw new TranslationConcurrencyException($"The translation changed after it was loaded. Expected version {expected}, current version {current?.ToString() ?? "none"}.");
    }

}
