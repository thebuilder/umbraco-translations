using System.Text.Json.Serialization;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.Core.Output;

[JsonConverter(typeof(JsonStringEnumConverter<TranslationOutputFormat>))]
public enum TranslationOutputFormat
{
    [JsonStringEnumMemberName("next-intl")]
    NextIntl,

    [JsonStringEnumMemberName("i18next-v4")]
    I18NextV4,
}

public static class TranslationOutputFormats
{
    public static bool TryParse(string value, out TranslationOutputFormat format)
    {
        switch (value.ToLowerInvariant())
        {
            case "next-intl":
                format = TranslationOutputFormat.NextIntl;
                return true;
            case "i18next-v4":
                format = TranslationOutputFormat.I18NextV4;
                return true;
            default:
                format = default;
                return false;
        }
    }

    public static bool Supports(TranslationOutputFormat format, MessageFormat messageFormat) => format switch
    {
        TranslationOutputFormat.NextIntl => messageFormat is MessageFormat.Icu or MessageFormat.PlainText,
        TranslationOutputFormat.I18NextV4 => messageFormat is MessageFormat.I18NextV4 or MessageFormat.PlainText,
        _ => false,
    };

    public static IReadOnlyList<TranslationOutputFormat> CompatibleWith(IEnumerable<MessageFormat> messageFormats)
    {
        var formats = messageFormats.ToHashSet();
        return Enum.GetValues<TranslationOutputFormat>()
            .Where(outputFormat => formats.All(messageFormat => Supports(outputFormat, messageFormat)))
            .ToArray();
    }

    public static TranslationFacets CreateFacets(TranslationFacetData data)
    {
        var classified = data.OutputGroups
            .Select(group => new
            {
                Group = group,
                Formats = CompatibleWith(group.MessageFormats),
            })
            .ToArray();
        return new(
            data.Locales,
            data.OutputGroups.Select(group => group.Namespace).Distinct().Order().ToArray(),
            classified.SelectMany(item => item.Formats.Select(format =>
                new TranslationOutputEndpoint(item.Group.Locale, item.Group.Namespace, format))).ToArray(),
            classified.Where(item => item.Formats.Count == 0).Select(item =>
                new TranslationOutputConflict(item.Group.Locale, item.Group.Namespace, item.Group.MessageFormats)).ToArray(),
            data.StatusCounts,
            data.TotalKeys);
    }
}
