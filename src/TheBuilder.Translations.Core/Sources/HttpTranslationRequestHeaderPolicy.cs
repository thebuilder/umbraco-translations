namespace TheBuilder.Translations.Core.Sources;

public static class HttpTranslationRequestHeaderPolicy
{
    private static readonly HashSet<string> TransportManagedNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "Connection",
        "Content-Length",
        "Host",
        "If-Modified-Since",
        "If-None-Match",
        "Transfer-Encoding",
        "Upgrade",
    };

    public static bool IsTransportManaged(string name) => TransportManagedNames.Contains(name);

    public static bool CanAddToRequest(string name)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://localhost");
        return request.Headers.TryAddWithoutValidation(name, "validation-value");
    }
}
