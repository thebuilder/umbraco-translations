using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using TheBuilder.Translations.Configuration;

namespace TheBuilder.Translations.Authorization;

public sealed class DeploymentSyncApiKeyAuthenticator(IOptions<DeploymentSyncOptions> options)
{
    internal DeploymentSyncAuthenticationResult Authenticate(string? authorizationHeader)
    {
        var configuredKey = options.Value.ApiKey;
        if (string.IsNullOrWhiteSpace(configuredKey))
            return DeploymentSyncAuthenticationResult.Disabled;

        if (!AuthenticationHeaderValue.TryParse(authorizationHeader, out var authorization) ||
            !authorization.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(authorization.Parameter))
            return DeploymentSyncAuthenticationResult.Unauthorized;

        var configuredHash = SHA256.HashData(Encoding.UTF8.GetBytes(configuredKey));
        var suppliedHash = SHA256.HashData(Encoding.UTF8.GetBytes(authorization.Parameter));
        return CryptographicOperations.FixedTimeEquals(configuredHash, suppliedHash)
            ? DeploymentSyncAuthenticationResult.Authorized
            : DeploymentSyncAuthenticationResult.Unauthorized;
    }
}

internal enum DeploymentSyncAuthenticationResult
{
    Disabled,
    Unauthorized,
    Authorized,
}
