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
public abstract class TranslationsApiControllerBase : ControllerBase;
