using Microsoft.AspNetCore.Authorization;
using Umbraco.Cms.Core.Security;
using Umbraco.Extensions;

namespace TheBuilder.Translations.Authorization;

internal sealed class BackofficeAdministratorRequirement : IAuthorizationRequirement;

internal sealed class BackofficeAdministratorHandler(IBackOfficeSecurityAccessor securityAccessor)
    : AuthorizationHandler<BackofficeAdministratorRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, BackofficeAdministratorRequirement requirement)
    {
        if (context.User.IsInRole(Umbraco.Cms.Core.Constants.Security.AdminGroupAlias) ||
            securityAccessor.BackOfficeSecurity?.CurrentUser?.IsAdmin() is true)
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
