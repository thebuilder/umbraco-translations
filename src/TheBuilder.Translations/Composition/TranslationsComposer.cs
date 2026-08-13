using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TheBuilder.Translations.Authorization;
using TheBuilder.Translations.Configuration;
using TheBuilder.Translations.Core.Output;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;
using TheBuilder.Translations.Core.Validation;
using TheBuilder.Translations.Localization;
using TheBuilder.Translations.Migrations;
using TheBuilder.Translations.Persistence;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Extensions;

namespace TheBuilder.Translations.Composition;

public sealed class TranslationsComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.PackageMigrationPlans().Add(typeof(TranslationsMigrationPlan));
        builder.Services.AddOptions<DeploymentSyncOptions>()
            .Bind(builder.Config.GetSection(DeploymentSyncOptions.SectionName))
            .Validate(
                options => string.IsNullOrWhiteSpace(options.ApiKey) ||
                           (options.ApiKey.Length >= 32 && options.ApiKey.All(character => !char.IsWhiteSpace(character))),
                $"{DeploymentSyncOptions.ApiKeyConfigurationName} must contain at least 32 non-whitespace characters when configured.")
            .ValidateOnStart();
        builder.Services.AddOptions<TranslationSourceSecurityOptions>()
            .Bind(builder.Config.GetSection(TranslationSourceSecurityOptions.SectionName));
        builder.Services.AddAuthorization(ConfigurePolicies);
        builder.Services.AddSingleton<DeploymentSyncApiKeyAuthenticator>();
        builder.Services.AddSingleton<IAuthorizationHandler, BackofficeAdministratorHandler>();
        builder.Services.AddSingleton<IAuthorizationHandler, TranslationSectionAccessHandler>();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<IMessageFormatValidator, MessageFormatValidator>();
        builder.Services.AddSingleton<ITranslationSourceParser, NestedJsonParser>();
        builder.Services.AddHttpClient<ITranslationSourceTransport, HttpTranslationSourceTransport>()
            .ConfigurePrimaryHttpMessageHandler(services => TranslationSourceHttpHandler.Create(
                services.GetRequiredService<IOptions<TranslationSourceSecurityOptions>>().Value));
        builder.Services.AddSingleton<ITranslationSnapshotChangePublisher, NullTranslationSnapshotChangePublisher>();
        builder.Services.AddScoped<UmbracoTranslationStore>();
        builder.Services.AddScoped<ITranslationSourceRepository>(services => services.GetRequiredService<UmbracoTranslationStore>());
        builder.Services.AddScoped<ITranslationSynchronizationStore>(services => services.GetRequiredService<UmbracoTranslationStore>());
        builder.Services.AddScoped<ITranslationMessageRepository>(services => services.GetRequiredService<UmbracoTranslationStore>());
        builder.Services.AddScoped<ITranslationEditorRepository>(services => services.GetRequiredService<UmbracoTranslationStore>());
        builder.Services.AddScoped<TranslationSyncEngine>();
        builder.Services.AddSingleton<ITranslationOutputSerializer, NestedJsonOutputSerializer>();
        // No caching wrapper: ILanguageService is already cached inside Umbraco, and a second layer
        // would only introduce staleness after a language is added or the default one changes.
        builder.Services.AddScoped<ITranslationLocaleCatalog, UmbracoTranslationLocaleCatalog>();
    }

    private static void ConfigurePolicies(AuthorizationOptions options)
    {
        options.AddPolicy(TranslationPolicies.View, policy => policy.RequireAuthenticatedUser().AddRequirements(new TranslationSectionAccessRequirement()));
        options.AddPolicy(TranslationPolicies.Edit, policy => policy.RequireAuthenticatedUser().AddRequirements(new TranslationSectionAccessRequirement()));
        options.AddPolicy(TranslationPolicies.ManageSources, policy => policy.RequireAuthenticatedUser().AddRequirements(new BackofficeAdministratorRequirement()));
        options.AddPolicy(TranslationPolicies.Sync, policy => policy.RequireAuthenticatedUser().AddRequirements(new BackofficeAdministratorRequirement()));
    }
}
