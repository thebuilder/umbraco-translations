using System.Globalization;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.Extensions.AI;
using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.Assistant;

/// <summary>What the assistant is asked to do with a message.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<AssistantTask>))]
public enum AssistantTask
{
    /// <summary>Write the message in the target language from the reference language.</summary>
    Translate,
    Improve,
    Simplify,
    Shorten,
    FixSpelling,
}

/// <summary>
/// The words sent to the model. Kept apart from the orchestration so they can be read, and changed,
/// as the prose they are.
///
/// Only about translating. Tone of voice and brand come from the contexts on the Umbraco.AI profile,
/// which are added to every request through it, so nothing here competes with them.
/// </summary>
public static class AssistantPrompts
{
    public const string DefaultInstructions =
        """
        You write and edit the interface text of a website or application, one message at a time.
        Keep the meaning of the message. Match how the rest of the interface speaks to its users.
        Interface text is short: a button stays a word or two, a heading stays a heading.
        Never translate or rename placeholders, keys, product names or anything inside braces
        that names a value the application fills in.
        """;

    /// <summary>The conversation for one request: the instructions, then the task with its message.</summary>
    public static IReadOnlyList<ChatMessage> For(AssistantSettings settings, AssistantBrief brief) =>
    [
        new(ChatRole.System, settings.EffectiveInstructions + "\n\n" + FormatRules(brief.Format)),
        new(ChatRole.User, Task(brief)),
    ];

    /// <summary>
    /// What to say when a reply broke the message: the reason, in the validator's own words, and the
    /// same request again. One retry; a second failure is reported rather than retried.
    /// </summary>
    public static ChatMessage Correction(string problem, IReadOnlyDictionary<string, string> arguments) => new(
        ChatRole.User,
        $"That text cannot be used: {problem} " +
        (arguments.Count > 0
            ? $"It must contain exactly these placeholders, each once or more: {Placeholders(arguments)}. "
            : "It must contain no placeholders. ") +
        "Reply with a corrected version of the message only.");

    private static string Task(AssistantBrief brief)
    {
        var text = new StringBuilder();
        var language = LanguageName(brief.Locale);

        text.AppendLine(brief.Task switch
        {
            AssistantTask.Translate => $"Translate this message into {language}.",
            AssistantTask.Improve => $"Improve this {language} message: make it read naturally and clearly.",
            AssistantTask.Simplify => $"Simplify this {language} message: plainer words, shorter sentences.",
            AssistantTask.Shorten => $"Shorten this {language} message as far as it will go without losing its meaning.",
            AssistantTask.FixSpelling => $"Fix only the spelling, grammar and punctuation of this {language} message. Change nothing else.",
            _ => throw new ArgumentOutOfRangeException(nameof(brief), brief.Task, null),
        });
        text.AppendLine("Reply with the message only: no quotes, no explanation, no notes.");
        text.AppendLine();

        text.AppendLine($"Key: {brief.Namespace}.{brief.Key}");
        if (!string.IsNullOrWhiteSpace(brief.Description))
            text.AppendLine($"What it is for: {brief.Description}");
        if (brief.Arguments.Count > 0)
            text.AppendLine($"Placeholders it must keep, unchanged: {Placeholders(brief.Arguments)}");
        text.AppendLine();

        if (brief.Task == AssistantTask.Translate)
            text.AppendLine($"The message in {LanguageName(brief.FromLocale ?? "")}:");
        else
            text.AppendLine("The message:");
        text.Append(brief.Text);

        return text.ToString();
    }

    private static string FormatRules(MessageFormat format) => format switch
    {
        MessageFormat.Icu =>
            """
            Messages use ICU MessageFormat. Keep every {placeholder} exactly as it is. Keep the
            structure of plural and select arguments, and their keywords, in English
            ({count, plural, ...}, one, other, =0, #); translate only the words inside the branches.
            Give a plural the categories the target language needs, and always an "other".
            A literal brace or apostrophe is quoted the ICU way.
            """,
        MessageFormat.I18NextV4 =>
            """
            Messages use i18next. Keep every {{placeholder}} and $t(...) reference exactly as it is.
            """,
        _ => "Messages are plain text.",
    };

    private static string Placeholders(IReadOnlyDictionary<string, string> arguments) =>
        string.Join(", ", arguments.Select(argument => $"{{{argument.Key}}} ({argument.Value})"));

    /// <summary>
    /// The language as the model is likely to know it: "Danish (Denmark)" rather than "da-DK". The
    /// code only for a tag the platform has no name for.
    /// </summary>
    private static string LanguageName(string locale)
    {
        if (string.IsNullOrWhiteSpace(locale))
            return "the source language";
        try
        {
            var culture = CultureInfo.GetCultureInfo(locale);
            return string.IsNullOrEmpty(culture.EnglishName) || culture.EnglishName.StartsWith("Unknown", StringComparison.Ordinal)
                ? locale
                : culture.EnglishName;
        }
        catch (CultureNotFoundException)
        {
            return locale;
        }
    }
}

/// <summary>Everything about one message that goes into a request.</summary>
public sealed record AssistantBrief(
    AssistantTask Task,
    string Namespace,
    string Key,
    string Locale,
    string? FromLocale,
    string Text,
    string? Description,
    MessageFormat Format,
    IReadOnlyDictionary<string, string> Arguments);
