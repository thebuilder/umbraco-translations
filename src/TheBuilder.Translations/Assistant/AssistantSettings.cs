using System.Text.Json;
using Umbraco.Cms.Core.Services;

namespace TheBuilder.Translations.Assistant;

/// <summary>
/// How the translation assistant is set up on this site: whether editors see it, which Umbraco.AI
/// chat profile it uses (the site's default when none is chosen), and the instructions it is given.
/// The profile is where the model, the brand voice and the guardrails come from; the instructions
/// are only about translating, and are left empty to use <see cref="AssistantPrompts.DefaultInstructions"/>.
/// </summary>
public sealed record AssistantSettings(bool Enabled, Guid? ProfileId, string? Instructions)
{
    /// <summary>
    /// Off until an administrator turns it on: it sends the site's text to an AI provider, and
    /// installing or upgrading this package is not agreeing to that.
    /// </summary>
    public static AssistantSettings Default { get; } = new(Enabled: false, ProfileId: null, Instructions: null);

    /// <summary>The instructions actually sent: the site's own, or the default when it has none.</summary>
    public string EffectiveInstructions =>
        string.IsNullOrWhiteSpace(Instructions) ? AssistantPrompts.DefaultInstructions : Instructions;
}

/// <summary>
/// Kept in Umbraco's own key-value store: one small record edited from the settings dashboard needs
/// no table of its own, and the store already travels with the database the rest of the site uses.
/// </summary>
public sealed class AssistantSettingsStore(IKeyValueService keyValues)
{
    private const string StoreKey = Constants.PackageName + ".Assistant";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public AssistantSettings Get()
    {
        var stored = keyValues.GetValue(StoreKey);
        if (string.IsNullOrEmpty(stored))
            return AssistantSettings.Default;

        try
        {
            return JsonSerializer.Deserialize<AssistantSettings>(stored, Json) ?? AssistantSettings.Default;
        }
        catch (JsonException)
        {
            // Something else wrote the key, or a later version did and this one is reading it back.
            // Falling back to the defaults turns the assistant off, which is safer than guessing what was meant.
            return AssistantSettings.Default;
        }
    }

    public void Save(AssistantSettings settings) =>
        keyValues.SetValue(StoreKey, JsonSerializer.Serialize(settings, Json));
}
