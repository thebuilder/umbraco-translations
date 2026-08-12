using Microsoft.Data.Sqlite;
using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

/// <summary>
/// Reads a message joined to its override out of a real database.
///
/// This is the gap that let an override be written and then never read again. MessageViewRow
/// derives from a row marked [ExplicitColumns], so NPoco maps only attributed properties; the
/// override columns had no attributes and silently came back null on every read. Nothing caught it
/// because no test had ever round-tripped an override through the mapper -- the editor showed an
/// empty field for text it had just saved, and the delivery endpoints served application defaults
/// as though nothing had been customised.
/// </summary>
public sealed class MessageViewRowTests
{
    [Fact]
    public void Reads_the_override_joined_to_its_message()
    {
        using var database = Seeded(withOverride: true);

        var view = TranslationRowMapper.ToDomain(Read(database));

        Assert.NotNull(view.Override);
        Assert.Equal("Min tekst", view.Override.Value);
        Assert.Equal(2, view.Override.Version);
        Assert.Equal("editor", view.Override.UpdatedBy);
        Assert.Equal("Der opstod en fejl", view.Message.DefaultValue);
    }

    [Fact]
    public void Reports_no_override_when_there_is_none()
    {
        using var database = Seeded(withOverride: false);

        Assert.Null(TranslationRowMapper.ToDomain(Read(database)).Override);
    }

    [Fact]
    public void Carries_the_override_through_the_delivery_query()
    {
        using var database = Seeded(withOverride: true);

        var rows = database.Fetch<MessageViewRow>(TranslationSql.OutputMessages("da", "website"));

        // The delivery endpoints exist to serve these; returning the default instead would make
        // every override invisible at runtime.
        Assert.Equal("Min tekst", TranslationRowMapper.ToDomain(rows.Single()).Override?.Value);
    }

    [Fact]
    public void Marks_an_override_written_against_older_text_as_needing_review()
    {
        using var database = Seeded(withOverride: true, checksumAtEdit: "older");

        // Needs-review is derived by comparing the two checksums, so it depends on the same columns
        // and was equally unreachable.
        Assert.True(TranslationRowMapper.ToDomain(Read(database)).NeedsReview);
    }

    private static MessageViewRow Read(IDatabase database) =>
        database.Single<MessageViewRow>(TranslationSql.MessageSelect + " WHERE m.Id = @0", MessageId);

    private static readonly Guid MessageId = Guid.Parse("575e9cae-43e9-4bfa-a443-68633c7028e4");

    private static Database Seeded(bool withOverride, string checksumAtEdit = "current")
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        var database = new Database(connection, DatabaseType.SQLite);
        database.Execute($"""
            CREATE TABLE {Constants.Tables.Messages} (
                Id TEXT PRIMARY KEY, SourceId TEXT, Namespace TEXT, [Key] TEXT, Locale TEXT,
                DefaultValue TEXT, Format TEXT, ArgumentSignature TEXT, Description TEXT,
                SourceRevision TEXT, DefaultChecksum TEXT, PreviousDefaultChecksum TEXT,
                FirstSeenAt TEXT, LastSeenAt TEXT, State TEXT)
            """);
        database.Execute($"""
            CREATE TABLE {Constants.Tables.Overrides} (
                MessageId TEXT PRIMARY KEY, Value TEXT, SourceChecksumAtEdit TEXT, Version INTEGER,
                CreatedAt TEXT, CreatedBy TEXT, UpdatedAt TEXT, UpdatedBy TEXT)
            """);
        database.Execute($"""
            INSERT INTO {Constants.Tables.Messages}
                (Id, SourceId, Namespace, [Key], Locale, DefaultValue, Format, ArgumentSignature,
                 SourceRevision, DefaultChecksum, FirstSeenAt, LastSeenAt, State)
            VALUES (@0, @1, 'website', 'error.title', 'da', 'Der opstod en fejl', @2, @3,
                    'revision', 'current', @4, @4, @5)
            """,
            MessageId, Guid.NewGuid(), MessageFormat.Icu.ToString(), "{}", DateTime.UnixEpoch,
            TranslationMessageState.Active.ToString());

        if (withOverride)
        {
            database.Execute($"""
                INSERT INTO {Constants.Tables.Overrides}
                    (MessageId, Value, SourceChecksumAtEdit, Version, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy)
                VALUES (@0, 'Min tekst', @1, 2, @2, 'editor', @2, 'editor')
                """, MessageId, checksumAtEdit, DateTime.UnixEpoch);
        }

        return database;
    }
}
