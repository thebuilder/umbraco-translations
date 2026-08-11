namespace TheBuilder.Translations.Example;

public sealed class SampleMessagesMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var isI18NextV4 = context.Request.Path.StartsWithSegments("/sample/i18next", out PathString remaining);
        if (!isI18NextV4 && !context.Request.Path.StartsWithSegments("/sample/messages", out remaining))
        {
            await next(context);
            return;
        }

        string fileName = remaining.Value?.TrimStart('/') ?? string.Empty;
        if (!fileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        string locale = fileName[..^".json".Length];
        if (!SampleMessages.TryGet(locale, isI18NextV4, out IReadOnlyDictionary<string, object>? messages))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        context.Response.Headers.CacheControl = "no-store";
        await context.Response.WriteAsJsonAsync(messages);
    }
}
