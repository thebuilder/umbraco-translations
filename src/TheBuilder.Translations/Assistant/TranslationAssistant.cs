using Microsoft.Extensions.AI;
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

/// <summary>How a request ended. Exactly one of these, so the caller cannot read a value off a failure.</summary>
public abstract record AssistantOutcome
{
    private AssistantOutcome() { }

    /// <summary>Text that passes the same validation a save does.</summary>
    public sealed record Suggested(string Value) : AssistantOutcome;

    /// <summary>The assistant is not set up: Umbraco.AI is missing, turned off here, or has no profile.</summary>
    public sealed record Unavailable(string Reason) : AssistantOutcome;

    /// <summary>The request itself was unusable: nothing to translate from, or nothing to rewrite.</summary>
    public sealed record Invalid(string Reason) : AssistantOutcome;

    /// <summary>The model answered twice with text that would break the message.</summary>
    public sealed record Rejected(string Reason) : AssistantOutcome;

    /// <summary>Umbraco.AI or the provider behind it failed.</summary>
    public sealed record Failed(string Reason) : AssistantOutcome;
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
    IMessageFormatValidator validator)
{
    /// <summary>
    /// Whether an editor should be offered the assistant: Umbraco.AI is installed, the assistant is
    /// turned on here, and there is a profile for it to use.
    /// </summary>
    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken) =>
        await UnavailableReasonAsync(settings.Get(), cancellationToken) is null;

    public async Task<AssistantOutcome> SuggestAsync(AssistantRequest request, CancellationToken cancellationToken)
    {
        var current = settings.Get();
        if (await UnavailableReasonAsync(current, cancellationToken) is { } unavailable)
            return new AssistantOutcome.Unavailable(unavailable);

        return await PrepareAsync(request, cancellationToken) switch
        {
            Preparation.Ready ready => await AskAsync(current, ready.Brief, ready.Shape, cancellationToken),
            Preparation.Problem problem => new AssistantOutcome.Invalid(problem.Reason),
            _ => throw new InvalidOperationException("Unknown preparation."),
        };
    }

    private async Task<AssistantOutcome> AskAsync(
        AssistantSettings current,
        AssistantBrief brief,
        TranslationMessage shape,
        CancellationToken cancellationToken)
    {
        var conversation = AssistantPrompts.For(current, brief).ToList();
        try
        {
            for (var attempt = 0; ; attempt++)
            {
                var reply = Clean(await chat.CompleteAsync(current.ProfileId, conversation, cancellationToken));
                var problem = MessageOverrideValidation.Describe(reply, shape, validator);
                if (problem is null)
                    return new AssistantOutcome.Suggested(reply);
                if (attempt == 1)
                    return new AssistantOutcome.Rejected(problem);

                conversation.Add(new(ChatRole.Assistant, reply));
                conversation.Add(AssistantPrompts.Correction(problem, shape.Arguments));
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            // Provider errors arrive as whatever the provider's SDK throws. The message is what an
            // administrator needs to fix it (a key, a quota, a model name); the type is noise.
            return new AssistantOutcome.Failed(exception.Message);
        }
    }

    private async Task<string?> UnavailableReasonAsync(AssistantSettings current, CancellationToken cancellationToken)
    {
        if (!chat.IsInstalled)
            return "Umbraco.AI is not installed on this site.";
        if (!current.Enabled)
            return "The translation assistant is turned off in the translation settings.";
        if (current.ProfileId is { } profileId)
        {
            var profiles = await chat.GetProfilesAsync(cancellationToken);
            return profiles.Any(profile => profile.Id == profileId)
                ? null
                : "The AI profile chosen for translations no longer exists. Choose another in the translation settings.";
        }
        return await chat.HasDefaultProfileAsync(cancellationToken)
            ? null
            : "No AI profile is set up for chat. Create one in the AI section, or choose one in the translation settings.";
    }

    /// <summary>A request turned into what the model is asked, or the reason it cannot be.</summary>
    private abstract record Preparation
    {
        public sealed record Ready(AssistantBrief Brief, TranslationMessage Shape) : Preparation;

        public sealed record Problem(string Reason) : Preparation;
    }

    /// <summary>
    /// The text to work on, and the message whose shape it must keep. A translation that has never
    /// been written has no row of its own, so its format and placeholders come from the reference
    /// language's message -- the same key, which the validator holds every language to. Nothing is
    /// created to find them: asking for a suggestion must not leave a row behind.
    /// </summary>
    private async Task<Preparation> PrepareAsync(AssistantRequest request, CancellationToken cancellationToken)
    {
        var target = await editor.FindMessageAsync(request.Target, cancellationToken);
        TranslationMessageView? reference = null;
        string text;

        if (request.Task == AssistantTask.Translate)
        {
            if (string.IsNullOrWhiteSpace(request.ReferenceLocale))
                return new Preparation.Problem("Choose a language to translate from.");
            reference = await editor.FindMessageAsync(
                request.Target with { Locale = request.ReferenceLocale }, cancellationToken);
            var from = reference?.Override?.Value ?? reference?.Message.DefaultValue;
            if (string.IsNullOrWhiteSpace(from))
                return new Preparation.Problem("There is no text in that language to translate from.");
            text = from;
        }
        else
        {
            if (string.IsNullOrWhiteSpace(request.Text))
                return new Preparation.Problem("There is no text to rewrite.");
            text = request.Text;
        }

        if ((target?.Message ?? reference?.Message) is not { } shape)
            return new Preparation.Problem("The message could not be found.");

        return new Preparation.Ready(
            new AssistantBrief(
                request.Task,
                request.Target.Namespace,
                request.Target.Key,
                request.Target.Locale,
                request.ReferenceLocale,
                text,
                shape.Description,
                shape.Format,
                shape.Arguments),
            shape);
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
