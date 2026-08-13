using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Common.Attributes;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Cms.Web.Common.Routing;
using TheBuilder.Translations.Authorization;

namespace TheBuilder.Translations.ManagementApi;

[ApiController]
[BackOfficeRoute(Constants.ApiRoot)]
[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
[Authorize(Policy = TranslationPolicies.View)]
[MapToApi(Constants.ApiName)]
// Responses carry no cache headers otherwise, so a browser is free to reuse a GET heuristically.
// It did: after saving an override, re-reading the message served the pre-save body from cache and
// the editor showed an empty field for a translation that had just been written.
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public abstract class TranslationsApiControllerBase : ControllerBase;
