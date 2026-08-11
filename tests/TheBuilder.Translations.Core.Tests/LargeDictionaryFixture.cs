using System.Text.Json;

namespace TheBuilder.Translations.Core.Tests;

internal static class LargeDictionaryFixture
{
    public static MemoryStream Create(int count)
    {
        var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            writer.WriteStartObject("generated");
            for (var index = 0; index < count; index++)
                writer.WriteString($"message-{index:D5}", $"Generated message {index:D5} for {{name}}");
            writer.WriteEndObject();
            writer.WriteEndObject();
        }
        stream.Position = 0;
        return stream;
    }
}
