using System.Text.Json;
using System.Text.Json.Nodes;
using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.Core.Output;

public sealed class NestedJsonOutputSerializer : ITranslationOutputSerializer
{
    public string Serialize(IReadOnlyCollection<TranslationMessageView> messages, TranslationOutputMode mode)
    {
        var root = new JsonObject();
        foreach (var view in messages.OrderBy(item => item.Message.Identity.Key, StringComparer.Ordinal))
        {
            var value = mode switch
            {
                TranslationOutputMode.Overrides => view.Override?.Value,
                TranslationOutputMode.All => view.Override?.Value ?? view.Message.DefaultValue,
                _ => throw new ArgumentOutOfRangeException(nameof(mode), mode, null),
            };
            if (value is null)
                continue;
            Insert(root, view.Message.Identity.Key.Split('.'), value);
        }
        return root.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
    }

    private static void Insert(JsonObject root, IReadOnlyList<string> segments, string value)
    {
        var current = root;
        for (var index = 0; index < segments.Count - 1; index++)
        {
            if (current[segments[index]] is JsonNode existing && existing is not JsonObject)
                throw new TranslationOutputCollisionException(string.Join('.', segments));
            if (current[segments[index]] is not JsonObject child)
            {
                child = new JsonObject();
                current[segments[index]] = child;
            }
            current = child;
        }
        if (current.ContainsKey(segments[^1]))
            throw new TranslationOutputCollisionException(string.Join('.', segments));
        current[segments[^1]] = value;
    }
}

public sealed class TranslationOutputCollisionException(string key)
    : InvalidOperationException($"Translation output contains the conflicting key '{key}'. Give overlapping sources distinct namespaces or keys.");
