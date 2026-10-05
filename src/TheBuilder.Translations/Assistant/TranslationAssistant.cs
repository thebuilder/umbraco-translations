using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Assistant;

/// <summary>What was asked of the assistant: a task, the translation it is for, and the text to work on.</summary>
/// <param name="Text">The text to rewrite. Unused when translating, which works from the reference.</param>
/// <param name="ReferenceLocale">The language to translate from. Required when translating.</param>
public sealed record AssistantRequest(
    MessageIdentity Target,
    AssistantTask Task,
    string? Text,
    string? ReferenceLocale);

/// <summary>Why the assistant gave no suggestion, which decides how the request is answered.</summary>
public enum AssistantRefusal
{
    /// <summary>Not set up: turned off here, or no profile to use.</summary>
    Unavailable,

    /// <summary>The request itself was unusable: nothing to translate from, or nothing to rewrite.</summary>
    Invalid,

    /// <summary>The model answered twice with text that would break the message.</summary>
    Rejected,

    /// <summary>Umbraco.AI or the provider behind it failed.</summary>
    Failed,
}

/// <summary>The assistant gave no suggestion. The message is written for the editor.</summary>
public sealed class AssistantRefusedException(AssistantRefusal refusal, string message) : Exception(message)
{
    public AssistantRefusal Refusal { get; } = refusal;
}

/// <summary>
/// Suggests text for one translation. Never saves anything: the suggestion goes into the editor's
/// field as unsaved text, and the editor saves it, or does not, like anything else they typed.
///
/// Every suggestion is checked by <see cref="MessageOverrideValidation"/>, the same rule a save is
/// held to, so a suggestion that is offered can always be saved. A reply that fails it is sent back
/// once with the reason; a second failure is reported rather than retried, because a model that
/// cannot keep a placeholder after being told which one is not going to on the third try either.
/// </summary>
public sealed class TranslationAssistant(
    IAssistantChat chat,
    AssistantSettingsStore settings,
    ITranslationEditorRepository editor,
    IMessageFormatValidator validator,
    ILogger<TranslationAssistant> logger)
{
    /// <summary>
    /// Far longer than any instructions need to be, and short enough that the settings cannot be used
    /// to make every request expensive.
    /// </summary>
    public const int MaximumInstructionsLength = 4000;

    /// <summary>The longest text a rewrite takes. Interface text is short; this is room for a page of it.</summary>
    public const int MaximumTextLength = 10_000;

    /// <summary>The first reply, and the one correction it is allowed.</summary>
    private const int MaximumAttempts = 2;

    /// <summary>Whether an editor should be offered the assistant: it is turned on here and has a profile to use.</summary>
    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken) =>
        await UnavailableReasonAsync(settings.Get(), cancellationToken) is null;

    /// <summary>Saves the settings, or says why they cannot be saved.</summary>
    public async Task<string?> SaveSettingsAsync(AssistantSettings next, CancellationToken cancellationToken)
    {
        if (next.Instructions?.Length > MaximumInstructionsLength)
            return $"The instructions must be {MaximumInstructionsLength} characters or fewer.";
        if (next.ProfileId is { } id && !await chat.ProfileExistsAsync(id, cancellationToken))
            return "That AI profile does not exist, or is not a chat profile.";

        settings.Save(next);
        return null;
    }

    /// <summary>Text for the translation that passes the same validation a save does.</summary>
    /// <exception cref="AssistantRefusedException">There is no suggestion, and the message says why.</exception>
    public async Task<string> SuggestAsync(AssistantRequest request, CancellationToken cancellationToken)
    {
        var current = settings.Get();
        if (await UnavailableReasonAsync(current, cancellationToken) is { } unavailable)
            throw new AssistantRefusedException(AssistantRefusal.Unavailable, unavailable);
        if (Describe(request) is { } invalid)
            throw new AssistantRefusedException(AssistantRefusal.Invalid, invalid);

        // A translation that has never been written has no row of its own, so the format and
        // placeholders it must keep are the key's. Nothing is created to find them: asking for a
        // suggestion must not leave a row behind.
        var shape = await editor.FindKeyShapeAsync(request.Target, cancellationToken)
            ?? throw new AssistantRefusedException(AssistantRefusal.Invalid, "The message could not be found.");

        var text = request.ReferenceLocale is { } from
            ? await ReferenceTextAsync(request.Target with { Locale = from }, cancellationToken)
            // Describe has already refused a rewrite with no text.
            : request.Text!;

        var brief = new AssistantBrief(request.Task, request.Target.Locale, request.ReferenceLocale, text, shape);
        return await AskAsync(current, brief, cancellationToken);
    }

    /// <summary>The reference language's text as the site shows it: its custom text, or the application's.</summary>
    private async Task<string> ReferenceTextAsync(MessageIdentity reference, CancellationToken cancellationToken)
    {
        var message = await editor.FindMessageAsync(reference, cancellationToken);
        var text = message?.Override?.Value ?? message?.Message.DefaultValue;
        return string.IsNullOrWhiteSpace(text)
            ? throw new AssistantRefusedException(AssistantRefusal.Invalid, "There is no text in that language to translate from.")
            : text;
    }

    /// <summary>What is wrong with the request on its face, before anything is looked up.</summary>
    private static string? Describe(AssistantRequest request) => request.Task switch
    {
        AssistantTask.Translate when string.IsNullOrWhiteSpace(request.ReferenceLocale) =>
            "Choose a language to translate from.",
        AssistantTask.Translate => null,
        _ when request.ReferenceLocale is not null => "Only a translation has a language to translate from.",
        _ when string.IsNullOrWhiteSpace(request.Text) => "There is no text to rewrite.",
        _ when request.Text.Length > MaximumTextLength => $"The text to rewrite must be {MaximumTextLength} characters or fewer.",
        _ => null,
    };

    private async Task<string> AskAsync(AssistantSettings current, AssistantBrief brief, CancellationToken cancellationToken)
    {
        var conversation = AssistantPrompts.For(current, brief).ToList();
        for (var attempt = 1; ; attempt++)
        {
            var reply = Clean(await CompleteAsync(current.ProfileId, conversation, cancellationToken));
            var problem = reply.Length == 0
                ? "The reply was empty."
                : MessageOverrideValidation.Describe(reply, brief.Message, validator);
            if (problem is null)
                return reply;
            if (attempt == MaximumAttempts)
                throw new AssistantRefusedException(
                    AssistantRefusal.Rejected,
                    $"The AI could not produce text that keeps this message working. {problem}");

            conversation.Add(new(ChatRole.Assistant, reply));
            conversation.Add(AssistantPrompts.Correction(problem, brief.Message.Arguments));
        }
    }

    private async Task<string> CompleteAsync(Guid? profileId, IReadOnlyList<ChatMessage> conversation, CancellationToken cancellationToken)
    {
        try
        {
            return await chat.CompleteAsync(profileId, conversation, cancellationToken);
        }
        // A provider's own timeout arrives as a cancellation too; only the editor's is passed on.
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            // Provider errors are whatever the provider's SDK throws, and can carry endpoints and
            // account ids. The administrator who has to fix it reads the log; the editor is told
            // where to send them.
            logger.LogError(exception, "The translation assistant's request to Umbraco.AI failed.");
            throw new AssistantRefusedException(
                AssistantRefusal.Failed,
                "The AI request failed. The site's log has the details for an administrator.");
        }
    }

    private async Task<string?> UnavailableReasonAsync(AssistantSettings current, CancellationToken cancellationToken)
    {
        if (!current.Enabled)
            return "The translation assistant is turned off in the translation settings.";
        if (current.ProfileId is { } profileId)
            return await chat.ProfileExistsAsync(profileId, cancellationToken)
                ? null
                : "The AI profile chosen for translations no longer exists. Choose another in the translation settings.";
        return await chat.HasDefaultProfileAsync(cancellationToken)
            ? null
            : "No AI profile is set up for chat. Create one in the AI section, or choose one in the translation settings.";
    }

    /// <summary>
    /// Takes off what models add despite being told not to: surrounding whitespace, and the quotes or
    /// code fence a message gets wrapped in when it looks like code to them. Only when the whole reply
    /// is wrapped, so a message that starts with a quotation keeps it.
    /// </summary>
    internal static string Clean(string reply)
    {
        var text = reply.Trim();
        if (text.StartsWith("```", StringComparison.Ordinal) && text.EndsWith("```", StringComparison.Ordinal) && text.Length >= 6)
        {
            var body = text[3..^3];
            var firstLine = body.IndexOf('\n');
            // A fence may carry a language name on its opening line ("```json"); drop it with the fence.
            text = (firstLine >= 0 && !body[..firstLine].Contains(' ') ? body[(firstLine + 1)..] : body).Trim();
        }
        foreach (var (open, close) in new[] { ('"', '"'), ('“', '”'), ('\'', '\'') })
        {
            if (text.Length >= 2 && text[0] == open && text[^1] == close && text.IndexOf(close, 1) == text.Length - 1)
                return text[1..^1].Trim();
        }
        return text;
    }
}
