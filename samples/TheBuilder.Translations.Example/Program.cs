using TheBuilder.Translations.Example;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.CreateUmbracoBuilder()
    .AddBackOffice()
    .AddWebsite()
    .AddComposers()
    .Build();

WebApplication app = builder.Build();
await app.BootUmbracoAsync();
app.UseMiddleware<SampleMessagesMiddleware>();
app.UseUmbraco()
    .WithMiddleware(middleware =>
    {
        middleware.UseBackOffice();
        middleware.UseWebsite();
    })
    .WithEndpoints(endpoints =>
    {
        endpoints.UseBackOfficeEndpoints();
        endpoints.UseWebsiteEndpoints();
    });
await app.RunAsync();
