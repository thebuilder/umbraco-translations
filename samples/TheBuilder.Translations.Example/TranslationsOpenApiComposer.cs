using Asp.Versioning;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;
using System.Text.Json.Nodes;
using Swashbuckle.AspNetCore.SwaggerGen;
using TheBuilder.Translations;
using TheBuilder.Translations.Core.Output;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace TheBuilder.Translations.Example;

public sealed class TranslationsOpenApiComposer : IComposer
{
    private const string AutomationBearerScheme = "DeploymentSyncBearer";

    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddSingleton<IOperationIdHandler, TranslationsOperationIdHandler>();
        builder.Services.PostConfigure<SwaggerGenOptions>(options =>
        {
            options.SwaggerDoc(Constants.ApiName, new OpenApiInfo { Title = "Translations Backoffice API", Version = "1.0" });
            options.SwaggerDoc(Constants.AutomationApiName, new OpenApiInfo { Title = "Translations Automation API", Version = "1.0" });
            options.AddSecurityDefinition(AutomationBearerScheme, new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "API key",
                Description = "Dedicated deployment synchronization key configured on the Umbraco server.",
            });
            options.OperationFilter<TranslationsSecurityFilter>();
            options.DocumentFilter<AutomationSecurityFilter>();
            options.SchemaFilter<TranslationOutputFormatSchemaFilter>();
            var defaultInclusion = options.SwaggerGeneratorOptions.DocInclusionPredicate;
            options.DocInclusionPredicate((documentName, description) =>
                documentName == Constants.AutomationApiName
                    ? description.GroupName == Constants.AutomationApiName
                    : defaultInclusion(documentName, description));
        });
    }

    private sealed class TranslationsSecurityFilter : BackOfficeSecurityRequirementsOperationFilterBase
    {
        protected override string ApiName => Constants.ApiName;
    }

    private sealed class TranslationOutputFormatSchemaFilter : ISchemaFilter
    {
        public void Apply(IOpenApiSchema schema, SchemaFilterContext context)
        {
            if (context.Type != typeof(TranslationOutputFormat))
                return;

            schema.Enum?.Clear();
            schema.Enum?.Add(JsonValue.Create("next-intl"));
            schema.Enum?.Add(JsonValue.Create("i18next-v4"));
        }
    }

    private sealed class AutomationSecurityFilter : IDocumentFilter
    {
        public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
        {
            if (swaggerDoc.Info?.Title != "Translations Automation API")
                return;

            swaggerDoc.Security ??= [];
            swaggerDoc.Security.Add(new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference(AutomationBearerScheme, swaggerDoc)] = [],
            });
        }
    }

    private sealed class TranslationsOperationIdHandler(IOptions<ApiVersioningOptions> versioningOptions)
        : OperationIdHandler(versioningOptions)
    {
        protected override bool CanHandle(ApiDescription description, ControllerActionDescriptor controller) =>
            controller.ControllerTypeInfo.Namespace?.StartsWith("TheBuilder.Translations.ManagementApi", StringComparison.Ordinal) is true ||
            controller.ControllerTypeInfo.Namespace?.StartsWith("TheBuilder.Translations.AutomationApi", StringComparison.Ordinal) is true;

        public override string Handle(ApiDescription description)
        {
            var controller = description.ActionDescriptor.RouteValues["controller"]
                ?? throw new InvalidOperationException("The translation API operation has no controller name.");
            var action = description.ActionDescriptor.RouteValues["action"]
                ?? throw new InvalidOperationException("The translation API operation has no action name.");
            return $"{controller}_{action}";
        }
    }
}
