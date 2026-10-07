using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TheBuilder.Translations.Assistant;
using TheBuilder.Translations.Authorization;
using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.ManagementApi;

/// <summary>Whether the editor should offer the assistant at all.</summary>
public sealed record AssistantStatusResponse(bool Available);

/// <summary>Everything the settings dashboard shows about the assistant, and what it can be set to.</summary>
/// <param name="HasDefaultProfile">Whether Umbraco.AI has a default chat profile to fall back on.</param>
/// <param name="Instructions">The site's own instructions, or null to use <paramref name="DefaultInstructions"/>.</param>
public sealed record AssistantSettingsResponse(
    bool HasDefaultProfile,
    IReadOnlyList<AssistantProfile> Profiles,
    bool Enabled,
    Guid? ProfileId,
    string? Instructions,
    string DefaultInstructions);

public sealed record AssistantSettingsRequest(bool Enabled, Guid? ProfileId, string? Instructions);

/// <summary>A suggestion for one translation, addressed by identity like a save.</summary>
public sealed record AssistantSuggestionRequest(
    Guid SourceId,
    string Namespace,
    string Key,
    string Locale,
    AssistantTask Task,
    string? Text,
    string? ReferenceLocale)
{
    public AssistantRequest ToRequest() =>
        new(new MessageIdentity(SourceId, Namespace, Key, Locale), Task, Text, ReferenceLocale);
}

public sealed record AssistantSuggestionResponse(string Value);

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = Constants.PackageName)]
public sealed class AssistantController(
    TranslationAssistant assistant,
    AssistantSettingsStore settings,
    IAssistantChat chat) : TranslationsApiControllerBase
{
    [HttpGet("assistant")]
    public async Task<AssistantStatusResponse> GetStatus(CancellationToken cancellationToken) =>
        new(await assistant.IsAvailableAsync(cancellationToken));

    [HttpGet("assistant/settings")]
    [Authorize(Policy = TranslationPolicies.ManageSources)]
    public async Task<AssistantSettingsResponse> GetSettings(CancellationToken cancellationToken) =>
        await SettingsResponseAsync(settings.Get(), cancellationToken);

    [HttpPut("assistant/settings")]
    [Authorize(Policy = TranslationPolicies.ManageSources)]
    [ProducesResponseType(typeof(AssistantSettingsResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AssistantSettingsResponse>> SaveSettings(
        AssistantSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var next = new AssistantSettings(
            request.Enabled,
            request.ProfileId,
            string.IsNullOrWhiteSpace(request.Instructions) ? null : request.Instructions.Trim());
        if (await assistant.SaveSettingsAsync(next, cancellationToken) is { } problem)
            return BadRequest(problem);
        return await SettingsResponseAsync(next, cancellationToken);
    }

    /// <summary>
    /// Suggests text for one translation. Nothing is saved: the editor puts the suggestion in the
    /// field as unsaved text. Whatever comes back has passed the same validation a save does.
    /// </summary>
    [HttpPost("assistant/suggestions")]
    [Authorize(Policy = TranslationPolicies.Edit)]
    [ProducesResponseType(typeof(AssistantSuggestionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    public async Task<ActionResult<AssistantSuggestionResponse>> Suggest(
        AssistantSuggestionRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return new AssistantSuggestionResponse(await assistant.SuggestAsync(request.ToRequest(), cancellationToken));
        }
        catch (AssistantRefusedException refused)
        {
            return refused.Refusal switch
            {
                // Not set up is a state of the site rather than a fault in the request.
                AssistantRefusal.Unavailable => Conflict(refused.Message),
                AssistantRefusal.Invalid => BadRequest(refused.Message),
                AssistantRefusal.Rejected => UnprocessableEntity(refused.Message),
                _ => StatusCode(StatusCodes.Status502BadGateway, refused.Message),
            };
        }
    }

    private async Task<AssistantSettingsResponse> SettingsResponseAsync(
        AssistantSettings current,
        CancellationToken cancellationToken) =>
        new(
            HasDefaultProfile: await chat.HasDefaultProfileAsync(cancellationToken),
            Profiles: await chat.GetProfilesAsync(cancellationToken),
            current.Enabled,
            current.ProfileId,
            current.Instructions,
            AssistantPrompts.DefaultInstructions);
}
