using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TheBuilder.Translations.Authorization;

namespace TheBuilder.Translations.ManagementApi;

/// <summary>
/// What the current user may do, so the editor can render read-only affordances up front instead of
/// letting people type a translation and discover a 403 on save.
/// </summary>
public sealed record PermissionsResponse(bool CanView, bool CanEdit, bool CanManageSources, bool CanSync);

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = Constants.PackageName)]
public sealed class PermissionsController(IAuthorizationService authorization) : TranslationsApiControllerBase
{
    [HttpGet("permissions")]
    public async Task<PermissionsResponse> GetPermissions() => new(
        // Reaching this action already required Translations.View via the controller base.
        CanView: true,
        CanEdit: await AllowedAsync(TranslationPolicies.Edit),
        CanManageSources: await AllowedAsync(TranslationPolicies.ManageSources),
        CanSync: await AllowedAsync(TranslationPolicies.Sync));

    // Both handlers behind these policies are resource-free, so the resourceless overload is correct.
    private async Task<bool> AllowedAsync(string policy) =>
        (await authorization.AuthorizeAsync(User, policy)).Succeeded;
}
