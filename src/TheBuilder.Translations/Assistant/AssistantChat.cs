using Microsoft.Extensions.AI;
using Umbraco.AI.Core.Chat;
using Umbraco.AI.Core.Models;
using Umbraco.AI.Core.Profiles;

namespace TheBuilder.Translations.Assistant;

/// <summary>An Umbraco.AI chat profile, as the settings dashboard offers it.</summary>
public sealed record AssistantProfile(Guid Id, string Alias, string Name);

/// <summary>
/// The four things the assistant asks of Umbraco.AI. A seam rather than the Umbraco.AI services
/// themselves because those are wide (the profile service alone has fifteen members) and the
/// assistant's tests need to stand in for a model.
/// </summary>
public interface IAssistantChat
{
    Task<IReadOnlyList<AssistantProfile>> GetProfilesAsync(CancellationToken cancellationToken);

    Task<bool> HasDefaultProfileAsync(CancellationToken cancellationToken);

    /// <summary>Whether a chat profile with this id exists.</summary>
    Task<bool> ProfileExistsAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>
    /// Runs the conversation through the given profile, or the site's default chat profile when
    /// none is given, and returns the reply's text. The profile supplies the model and its contexts,
    /// so brand voice and guardrails apply here exactly as they do anywhere else on the site.
    /// </summary>
    Task<string> CompleteAsync(Guid? profileId, IReadOnlyList<ChatMessage> messages, CancellationToken cancellationToken);
}

internal sealed class UmbracoAiAssistantChat(IAIChatService chat, IAIProfileService profiles) : IAssistantChat
{
    /// <summary>What the requests are called in Umbraco.AI's own usage and audit logs.</summary>
    private const string RequestAlias = "theBuilderTranslations";

    public async Task<IReadOnlyList<AssistantProfile>> GetProfilesAsync(CancellationToken cancellationToken) =>
        (await profiles.GetProfilesAsync(AICapability.Chat, cancellationToken))
            .Select(profile => new AssistantProfile(profile.Id, profile.Alias, profile.Name))
            .OrderBy(profile => profile.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();

    public Task<bool> HasDefaultProfileAsync(CancellationToken cancellationToken) =>
        profiles.HasDefaultProfileAsync(AICapability.Chat, cancellationToken);

    public async Task<bool> ProfileExistsAsync(Guid id, CancellationToken cancellationToken) =>
        await profiles.GetProfileAsync(id, cancellationToken) is { Capability: AICapability.Chat };

    public async Task<string> CompleteAsync(
        Guid? profileId,
        IReadOnlyList<ChatMessage> messages,
        CancellationToken cancellationToken)
    {
        var response = await chat.GetChatResponseAsync(
            builder =>
            {
                builder.WithAlias(RequestAlias).WithName("Translations");
                if (profileId is { } id)
                    builder.WithProfile(id);
            },
            messages,
            cancellationToken);
        return response.Text;
    }
}
