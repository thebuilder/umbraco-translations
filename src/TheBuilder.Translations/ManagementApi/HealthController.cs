using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;

namespace TheBuilder.Translations.ManagementApi;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = Constants.PackageName)]
public sealed class HealthController : TranslationsApiControllerBase
{
    [HttpGet("health")]
    public object GetHealth() => new { status = "ready", phase = 5 };
}
