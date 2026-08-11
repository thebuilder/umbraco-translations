using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using TheBuilder.Translations.Authorization;
using Umbraco.Cms.Core.Security;
using Umbraco.Extensions;

namespace TheBuilder.Translations.Tests;

public sealed class TranslationAuthorizationTests
{
    [Fact]
    public async Task Section_access_uses_the_authenticated_management_api_claims()
    {
        var identity = BackofficeIdentity(
            allowedSections: [TranslationSectionAccessHandler.SectionAlias],
            roles: []);
        var requirement = new TranslationSectionAccessRequirement();
        var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(identity), null);
        var handler = new TranslationSectionAccessHandler(new EmptyBackOfficeSecurityAccessor());

        await handler.HandleAsync(context);

        Assert.True(context.HasSucceeded);
    }

    [Fact]
    public async Task Administrator_access_uses_the_authenticated_management_api_roles()
    {
        var identity = BackofficeIdentity(
            allowedSections: [TranslationSectionAccessHandler.SectionAlias],
            roles: [Umbraco.Cms.Core.Constants.Security.AdminGroupAlias]);
        var requirement = new BackofficeAdministratorRequirement();
        var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(identity), null);
        var handler = new BackofficeAdministratorHandler(new EmptyBackOfficeSecurityAccessor());

        await handler.HandleAsync(context);

        Assert.True(context.HasSucceeded);
    }

    [Fact]
    public async Task Section_access_denies_a_token_without_the_translation_section()
    {
        var requirement = new TranslationSectionAccessRequirement();
        var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(BackofficeIdentity([], [])), null);

        await new TranslationSectionAccessHandler(new EmptyBackOfficeSecurityAccessor()).HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    [Fact]
    public async Task Administrator_access_denies_a_non_administrator_token()
    {
        var requirement = new BackofficeAdministratorRequirement();
        var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(BackofficeIdentity([TranslationSectionAccessHandler.SectionAlias], [])), null);

        await new BackofficeAdministratorHandler(new EmptyBackOfficeSecurityAccessor()).HandleAsync(context);

        Assert.False(context.HasSucceeded);
    }

    private static ClaimsIdentity BackofficeIdentity(IReadOnlyCollection<string> allowedSections, IReadOnlyCollection<string> roles)
    {
        var identity = new ClaimsIdentity("BackOffice");
        identity.AddRequiredClaims(
            "1",
            Guid.NewGuid(),
            "admin@example.com",
            "Administrator",
            [],
            [],
            "en-US",
            "security-stamp",
            allowedSections,
            roles);
        return identity;
    }

    private sealed class EmptyBackOfficeSecurityAccessor : IBackOfficeSecurityAccessor
    {
        public IBackOfficeSecurity? BackOfficeSecurity => null;

        public IDisposable Override(IBackOfficeSecurity backOfficeSecurity) =>
            throw new NotSupportedException();
    }
}
