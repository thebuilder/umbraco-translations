using System.Text.Json.Serialization;

namespace TheBuilder.Translations.Core.Messages;

[JsonConverter(typeof(JsonStringEnumConverter<MessageFormat>))]
public enum MessageFormat
{
    PlainText,
    Icu,
    I18NextV4,
}
