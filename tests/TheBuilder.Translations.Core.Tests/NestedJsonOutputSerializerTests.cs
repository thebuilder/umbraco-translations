using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Output;
using TheBuilder.Translations.Core.Persistence;
using System.Text.Json;

namespace TheBuilder.Translations.Core.Tests;

public sealed class NestedJsonOutputSerializerTests
{
    [Fact]
    public void Advertises_next_intl_and_i18next_v4_json_contracts()
    {
        Assert.Equal("[\"next-intl\",\"i18next-v4\"]", JsonSerializer.Serialize(Enum.GetValues<TranslationOutputFormat>()));
    }

    [Fact]
    public void Emits_only_overrides_as_nested_json_in_stable_order()
    {
        var sourceId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var views = new[]
        {
            View("search.results", "Resultater", sourceId, now),
            View("navigation.home", "Forside", sourceId, now),
        };

        var json = new NestedJsonOutputSerializer().Serialize(views, TranslationOutputMode.Overrides);

        Assert.Equal("{\"navigation\":{\"home\":\"Forside\"},\"search\":{\"results\":\"Resultater\"}}", json);
    }

    [Fact]
    public void Emits_effective_values_using_overrides_over_source_defaults()
    {
        var sourceId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var overridden = View("navigation.home", "Home", "Forside", sourceId, now);
        var inherited = View("navigation.contact", "Contact", null, sourceId, now);

        var json = new NestedJsonOutputSerializer().Serialize([overridden, inherited], TranslationOutputMode.All);

        Assert.Equal("{\"navigation\":{\"contact\":\"Contact\",\"home\":\"Forside\"}}", json);
    }

    [Fact]
    public void Rejects_duplicate_output_keys_instead_of_choosing_a_source()
    {
        var now = DateTimeOffset.UtcNow;
        var views = new[]
        {
            View("navigation.home", "Home", null, Guid.NewGuid(), now),
            View("navigation.home", "Homepage", null, Guid.NewGuid(), now),
        };

        Assert.Throws<TranslationOutputCollisionException>(() =>
            new NestedJsonOutputSerializer().Serialize(views, TranslationOutputMode.All));
    }

    [Fact]
    public void Rejects_leaf_and_branch_key_collisions()
    {
        var sourceId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var views = new[]
        {
            View("navigation", "Navigation", null, sourceId, now),
            View("navigation.home", "Home", null, sourceId, now),
        };

        Assert.Throws<TranslationOutputCollisionException>(() =>
            new NestedJsonOutputSerializer().Serialize(views, TranslationOutputMode.All));
    }

    private static TranslationMessageView View(string key, string value, Guid sourceId, DateTimeOffset now)
        => View(key, "default", value, sourceId, now);

    private static TranslationMessageView View(string key, string defaultValue, string? overrideValue, Guid sourceId, DateTimeOffset now)
    {
        var id = Guid.NewGuid();
        var message = new TranslationMessage(id, new(sourceId, "website", key, "da"), defaultValue, MessageFormat.Icu,
            new Dictionary<string, string>(), null, "r1", "checksum", null, now, now, TranslationMessageState.Active);
        var translationOverride = overrideValue is null
            ? null
            : new TranslationOverride(id, overrideValue, "checksum", 1, now, "test", now, "test");
        return new(message, translationOverride);
    }
}
