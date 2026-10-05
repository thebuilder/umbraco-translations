using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.AI.Core.Chat;
using Umbraco.AI.Core.Models;
using Umbraco.AI.Core.Profiles;

namespace TheBuilder.Translations.Assistant;

/// <summary>An Umbraco.AI chat profile, as the settings dashboard offers it.</summary>
public sealed record AssistantProfile(Guid Id, string Alias, string Name);

/// <summary>
/// Everything the assistant needs from Umbraco.AI, and nothing else.
///
/// The package depends on Umbraco.AI.Core for its types but not on Umbraco.AI itself: a site that has
/// not installed Umbraco.AI has none of its services, and that has to be a state the assistant can
/// report rather than a startup failure. This is the one place that asks.
/// </summary>
public interface IAssistantChat
{
    /// <summary>Whether Umbraco.AI is installed on this site at all.</summary>
    bool IsInstalled { get; }

    Task<IReadOnlyList<AssistantProfile>> GetProfilesAsync(CancellationToken cancellationToken);

    Task<bool> HasDefaultProfileAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Runs the conversation through the given profile, or the site's default chat profile when
    /// none is given, and returns the reply's text. The profile supplies the model and its contexts,
    /// so brand voice and guardrails apply here exactly as they do anywhere else on the site.
    /// </summary>
    Task<string> CompleteAsync(Guid? profileId, IReadOnlyList<ChatMessage> messages, CancellationToken cancellationToken);
}

/// <summary>
/// <see cref="IAssistantChat"/> over Umbraco.AI. Resolves its services when asked rather than taking
/// them in the constructor, because on a site without Umbraco.AI there is nothing to take.
/// </summary>
internal sealed class UmbracoAiAssistantChat(IServiceProvider services) : IAssistantChat
{
    /// <summary>What the requests are called in Umbraco.AI's own usage and audit logs.</summary>
    private const string RequestAlias = "theBuilderTranslations";

    public bool IsInstalled => services.GetService<IAIChatService>() is not null;

    public async Task<IReadOnlyList<AssistantProfile>> GetProfilesAsync(CancellationToken cancellationToken)
    {
        if (services.GetService<IAIProfileService>() is not { } profiles)
            return [];

        return (await profiles.GetProfilesAsync(AICapability.Chat, cancellationToken))
            .Select(profile => new AssistantProfile(profile.Id, profile.Alias, profile.Name))
            .OrderBy(profile => profile.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();
    }

    public async Task<bool> HasDefaultProfileAsync(CancellationToken cancellationToken) =>
        services.GetService<IAIProfileService>() is { } profiles &&
        await profiles.HasDefaultProfileAsync(AICapability.Chat, cancellationToken);

    public async Task<string> CompleteAsync(
        Guid? profileId,
        IReadOnlyList<ChatMessage> messages,
        CancellationToken cancellationToken)
    {
        var chat = services.GetService<IAIChatService>()
            ?? throw new InvalidOperationException("Umbraco.AI is not installed.");

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
