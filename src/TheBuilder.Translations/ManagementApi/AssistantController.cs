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
/// <param name="Installed">Whether Umbraco.AI is installed. Without it there is nothing else to set.</param>
/// <param name="HasDefaultProfile">Whether Umbraco.AI has a default chat profile to fall back on.</param>
/// <param name="Instructions">The site's own instructions, or null to use <paramref name="DefaultInstructions"/>.</param>
public sealed record AssistantSettingsResponse(
    bool Installed,
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
    /// <summary>
    /// Far longer than any instructions need to be, and short enough that the settings cannot be used
    /// to make every request expensive.
    /// </summary>
    private const int MaximumInstructionsLength = 4000;

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
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AssistantSettingsResponse>> SaveSettings(
        AssistantSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var instructions = string.IsNullOrWhiteSpace(request.Instructions) ? null : request.Instructions.Trim();
        if (instructions?.Length > MaximumInstructionsLength)
            return Problem($"The instructions must be {MaximumInstructionsLength} characters or fewer.", statusCode: StatusCodes.Status400BadRequest);

        if (request.ProfileId is { } profileId &&
            (await chat.GetProfilesAsync(cancellationToken)).All(profile => profile.Id != profileId))
            return Problem("That AI profile does not exist, or is not a chat profile.", statusCode: StatusCodes.Status400BadRequest);

        var saved = new AssistantSettings(request.Enabled, request.ProfileId, instructions);
        settings.Save(saved);
        return await SettingsResponseAsync(saved, cancellationToken);
    }

    /// <summary>
    /// Suggests text for one translation. Nothing is saved: the editor puts the suggestion in the
    /// field as unsaved text. Whatever comes back has passed the same validation a save does.
    /// </summary>
    [HttpPost("assistant/suggestions")]
    [Authorize(Policy = TranslationPolicies.Edit)]
    [ProducesResponseType(typeof(AssistantSuggestionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status502BadGateway)]
    public async Task<ActionResult<AssistantSuggestionResponse>> Suggest(
        AssistantSuggestionRequest request,
        CancellationToken cancellationToken) =>
        await assistant.SuggestAsync(request.ToRequest(), cancellationToken) switch
        {
            AssistantOutcome.Suggested suggested => new AssistantSuggestionResponse(suggested.Value),
            // Not set up is a state of the site rather than a fault in the request.
            AssistantOutcome.Unavailable outcome => Problem(outcome.Reason, statusCode: StatusCodes.Status409Conflict),
            AssistantOutcome.Invalid outcome => Problem(outcome.Reason, statusCode: StatusCodes.Status400BadRequest),
            AssistantOutcome.Rejected outcome => Problem(
                $"The AI could not produce text that keeps this message working. {outcome.Reason}",
                statusCode: StatusCodes.Status422UnprocessableEntity),
            AssistantOutcome.Failed outcome => Problem(
                $"The AI request failed: {outcome.Reason}", statusCode: StatusCodes.Status502BadGateway),
            _ => throw new InvalidOperationException("Unknown assistant outcome."),
        };

    private async Task<AssistantSettingsResponse> SettingsResponseAsync(
        AssistantSettings current,
        CancellationToken cancellationToken) =>
        new(
            Installed: chat.IsInstalled,
            HasDefaultProfile: await chat.HasDefaultProfileAsync(cancellationToken),
            Profiles: await chat.GetProfilesAsync(cancellationToken),
            current.Enabled,
            current.ProfileId,
            current.Instructions,
            AssistantPrompts.DefaultInstructions);
}
