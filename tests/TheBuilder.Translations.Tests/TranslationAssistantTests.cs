using Microsoft.Extensions.AI;
using TheBuilder.Translations.Assistant;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Validation;
using Umbraco.Cms.Core.Services;

namespace TheBuilder.Translations.Tests;

public sealed class TranslationAssistantTests
{
    private static readonly Guid SourceId = Guid.NewGuid();

    private static MessageIdentity Identity(string locale) => new(SourceId, "checkout", "pay", locale);

    private static TranslationMessage Message(string locale, string text) => new(
        Guid.NewGuid(),
        Identity(locale),
        text,
        MessageFormat.Icu,
        new Dictionary<string, string> { ["amount"] = "string" },
        "The pay button at the end of checkout.",
        "rev",
        "sum",
        null,
        DateTimeOffset.UnixEpoch,
        DateTimeOffset.UnixEpoch,
        TranslationMessageState.Active);

    private static (TranslationAssistant Assistant, FakeChat Chat, FakeEditor Editor, AssistantSettingsStore Settings) Create(
        params string[] replies)
    {
        var chat = new FakeChat(replies);
        var editor = new FakeEditor();
        var settings = new AssistantSettingsStore(new FakeKeyValues());
        return (new TranslationAssistant(chat, settings, editor, new MessageFormatValidator()), chat, editor, settings);
    }

    private static AssistantRequest Translate(string to = "da-DK", string? from = "en-US") =>
        new(Identity(to), AssistantTask.Translate, Text: null, ReferenceLocale: from);

    [Fact]
    public async Task Translates_a_translation_that_has_never_been_written_from_the_reference()
    {
        var (assistant, chat, editor, _) = Create("Betal {amount}");
        editor.Messages[Identity("en-US")] = new(Message("en-US", "Pay {amount}"), null);

        var outcome = await assistant.SuggestAsync(Translate(), CancellationToken.None);

        Assert.Equal(new AssistantOutcome.Suggested("Betal {amount}"), outcome);
        // The reference text, the key and the placeholders all reach the model.
        var asked = chat.Conversations.Single()[^1].Text;
        Assert.Contains("Pay {amount}", asked);
        Assert.Contains("checkout.pay", asked);
        Assert.Contains("{amount}", asked);
        Assert.Contains("Danish", asked);
    }

    [Fact]
    public async Task Translates_from_the_reference_language_s_own_custom_text_when_it_has_some()
    {
        var (assistant, chat, editor, _) = Create("Betal {amount}");
        var english = Message("en-US", "Pay {amount}");
        editor.Messages[Identity("en-US")] = new(english, new TranslationOverride(
            english.Id, "Pay now: {amount}", "sum", 1, DateTimeOffset.UnixEpoch, "a", DateTimeOffset.UnixEpoch, "a"));

        await assistant.SuggestAsync(Translate(), CancellationToken.None);

        Assert.Contains("Pay now: {amount}", chat.Conversations.Single()[^1].Text);
    }

    [Fact]
    public async Task Sends_a_reply_that_breaks_a_placeholder_back_once_with_the_reason()
    {
        var (assistant, chat, editor, _) = Create("Betal {beløb}", "Betal {amount}");
        editor.Messages[Identity("en-US")] = new(Message("en-US", "Pay {amount}"), null);

        var outcome = await assistant.SuggestAsync(Translate(), CancellationToken.None);

        Assert.Equal(new AssistantOutcome.Suggested("Betal {amount}"), outcome);
        var retry = chat.Conversations[1];
        Assert.Equal(ChatRole.Assistant, retry[^2].Role);
        Assert.Equal("Betal {beløb}", retry[^2].Text);
        Assert.Contains(MessageOverrideValidation.ArgumentMismatchError, retry[^1].Text);
    }

    [Fact]
    public async Task Rejects_rather_than_retrying_again_when_the_second_reply_is_broken_too()
    {
        var (assistant, chat, editor, _) = Create("Betal {beløb}", "Betal {sum}", "Betal {amount}");
        editor.Messages[Identity("en-US")] = new(Message("en-US", "Pay {amount}"), null);

        var outcome = await assistant.SuggestAsync(Translate(), CancellationToken.None);

        Assert.IsType<AssistantOutcome.Rejected>(outcome);
        Assert.Equal(2, chat.Conversations.Count);
    }

    [Fact]
    public async Task Rewrites_the_text_it_is_given_and_keeps_the_target_s_own_shape()
    {
        var (assistant, chat, editor, _) = Create("Betal {amount}");
        editor.Messages[Identity("da-DK")] = new(Message("da-DK", "Betal {amount}"), null);

        var outcome = await assistant.SuggestAsync(
            new AssistantRequest(Identity("da-DK"), AssistantTask.Shorten, "Betal venligst nu {amount}", null),
            CancellationToken.None);

        Assert.Equal(new AssistantOutcome.Suggested("Betal {amount}"), outcome);
        Assert.Contains("Betal venligst nu {amount}", chat.Conversations.Single()[^1].Text);
    }

    [Fact]
    public async Task Never_creates_a_row_to_answer()
    {
        var (assistant, _, editor, _) = Create("Betal {amount}");
        editor.Messages[Identity("en-US")] = new(Message("en-US", "Pay {amount}"), null);

        await assistant.SuggestAsync(Translate(), CancellationToken.None);

        Assert.Equal(0, editor.Ensured);
    }

    [Theory]
    [InlineData(null, "Choose a language to translate from.")]
    [InlineData("de-DE", "There is no text in that language to translate from.")]
    public async Task Explains_a_translation_with_nothing_to_translate_from(string? from, string reason)
    {
        var (assistant, chat, _, _) = Create();

        var outcome = await assistant.SuggestAsync(Translate(from: from), CancellationToken.None);

        Assert.Equal(new AssistantOutcome.Invalid(reason), outcome);
        Assert.Empty(chat.Conversations);
    }

    [Fact]
    public async Task Is_unavailable_without_Umbraco_AI()
    {
        var (assistant, chat, _, _) = Create();
        chat.Installed = false;

        Assert.False(await assistant.IsAvailableAsync(CancellationToken.None));
        Assert.IsType<AssistantOutcome.Unavailable>(await assistant.SuggestAsync(Translate(), CancellationToken.None));
    }

    [Fact]
    public async Task Is_unavailable_when_turned_off_or_without_a_profile_to_use()
    {
        var (assistant, chat, _, settings) = Create();
        Assert.True(await assistant.IsAvailableAsync(CancellationToken.None));

        settings.Save(AssistantSettings.Default with { Enabled = false });
        Assert.False(await assistant.IsAvailableAsync(CancellationToken.None));

        settings.Save(AssistantSettings.Default);
        chat.DefaultProfile = false;
        Assert.False(await assistant.IsAvailableAsync(CancellationToken.None));

        // A chosen profile stands in for the missing default -- while it exists.
        var chosen = new AssistantProfile(Guid.NewGuid(), "translator", "Translator");
        chat.Profiles.Add(chosen);
        settings.Save(AssistantSettings.Default with { ProfileId = chosen.Id });
        Assert.True(await assistant.IsAvailableAsync(CancellationToken.None));

        chat.Profiles.Clear();
        Assert.False(await assistant.IsAvailableAsync(CancellationToken.None));
    }

    [Fact]
    public async Task Uses_the_chosen_profile_and_the_site_s_own_instructions()
    {
        var (assistant, chat, editor, settings) = Create("Betal {amount}");
        editor.Messages[Identity("en-US")] = new(Message("en-US", "Pay {amount}"), null);
        var chosen = new AssistantProfile(Guid.NewGuid(), "translator", "Translator");
        chat.Profiles.Add(chosen);
        settings.Save(new AssistantSettings(true, chosen.Id, "Write like a pirate."));

        await assistant.SuggestAsync(Translate(), CancellationToken.None);

        Assert.Equal(chosen.Id, chat.ProfileIds.Single());
        var system = chat.Conversations.Single()[0];
        Assert.Equal(ChatRole.System, system.Role);
        Assert.StartsWith("Write like a pirate.", system.Text);
    }

    [Fact]
    public async Task Reports_a_provider_failure_with_its_message()
    {
        var (assistant, chat, editor, _) = Create();
        editor.Messages[Identity("en-US")] = new(Message("en-US", "Pay {amount}"), null);
        chat.Failure = new InvalidOperationException("The API key is invalid.");

        var outcome = await assistant.SuggestAsync(Translate(), CancellationToken.None);

        Assert.Equal(new AssistantOutcome.Failed("The API key is invalid."), outcome);
    }

    [Theory]
    [InlineData("  Betal {amount}\n", "Betal {amount}")]
    [InlineData("\"Betal {amount}\"", "Betal {amount}")]
    [InlineData("“Betal {amount}”", "Betal {amount}")]
    [InlineData("```\nBetal {amount}\n```", "Betal {amount}")]
    [InlineData("```icu\nBetal {amount}\n```", "Betal {amount}")]
    // Quotes that belong to the message stay.
    [InlineData("\"Betal\" eller \"Annuller\"", "\"Betal\" eller \"Annuller\"")]
    public void Takes_off_the_wrapping_models_add(string reply, string expected) =>
        Assert.Equal(expected, TranslationAssistant.Clean(reply));

    [Fact]
    public void Falls_back_to_the_defaults_when_the_stored_settings_cannot_be_read()
    {
        var values = new FakeKeyValues();
        values.SetValue(Constants.PackageName + ".Assistant", "{not json");

        Assert.Equal(AssistantSettings.Default, new AssistantSettingsStore(values).Get());
    }

    private sealed class FakeChat(IEnumerable<string> replies) : IAssistantChat
    {
        private readonly Queue<string> _replies = new(replies);

        public bool Installed { get; set; } = true;
        public bool DefaultProfile { get; set; } = true;
        public List<AssistantProfile> Profiles { get; } = [];
        public List<IReadOnlyList<ChatMessage>> Conversations { get; } = [];
        public List<Guid?> ProfileIds { get; } = [];
        public Exception? Failure { get; set; }

        public bool IsInstalled => Installed;

        public Task<IReadOnlyList<AssistantProfile>> GetProfilesAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<AssistantProfile>>(Profiles.ToArray());

        public Task<bool> HasDefaultProfileAsync(CancellationToken cancellationToken) => Task.FromResult(DefaultProfile);

        public Task<string> CompleteAsync(Guid? profileId, IReadOnlyList<ChatMessage> messages, CancellationToken cancellationToken)
        {
            if (Failure is not null)
                throw Failure;
            Conversations.Add(messages.ToArray());
            ProfileIds.Add(profileId);
            return Task.FromResult(_replies.Dequeue());
        }
    }

    private sealed class FakeEditor : ITranslationEditorRepository
    {
        public Dictionary<MessageIdentity, TranslationMessageView> Messages { get; } = [];
        public int Ensured { get; private set; }

        public Task<TranslationMessageView?> FindMessageAsync(MessageIdentity identity, CancellationToken cancellationToken) =>
            Task.FromResult(Messages.GetValueOrDefault(identity));

        public Task<TranslationMessageView> EnsureMessageAsync(MessageIdentity identity, CancellationToken cancellationToken)
        {
            Ensured++;
            throw new NotSupportedException();
        }

        public Task<IReadOnlyList<string>> GetLocalesAsync(CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<Page<TranslationMessageKeyView>> QueryKeysAsync(MessageKeyQuery query, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<MessageKeyReference>> QueryKeyReferencesAsync(
            MessageKeyQuery query,
            int limit,
            CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class FakeKeyValues : IKeyValueService
    {
        private readonly Dictionary<string, string?> _values = [];

        public string? GetValue(string key) => _values.GetValueOrDefault(key);

        public IReadOnlyDictionary<string, string?>? FindByKeyPrefix(string keyPrefix) =>
            _values.Where(pair => pair.Key.StartsWith(keyPrefix, StringComparison.Ordinal)).ToDictionary();

        public void SetValue(string key, string value) => _values[key] = value;

        public void SetValue(string key, string originValue, string newValue) => _values[key] = newValue;

        public bool TrySetValue(string key, string originValue, string newValue)
        {
            _values[key] = newValue;
            return true;
        }
    }
}
