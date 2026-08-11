using System.Net;
using System.Net.Sockets;
using System.Text;
using TheBuilder.Translations.Core.Sources;

namespace TheBuilder.Translations.Core.Tests;

public sealed class TranslationSourceNetworkPolicyTests
{
    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("10.0.0.1")]
    [InlineData("100.64.0.1")]
    [InlineData("169.254.169.254")]
    [InlineData("172.16.0.1")]
    [InlineData("192.168.0.1")]
    [InlineData("224.0.0.1")]
    [InlineData("::1")]
    [InlineData("fe80::1")]
    [InlineData("fc00::1")]
    [InlineData("ff02::1")]
    [InlineData("::ffff:127.0.0.1")]
    [InlineData("::127.0.0.1")]
    [InlineData("64:ff9b::127.0.0.1")]
    [InlineData("2002:7f00:1::")]
    [InlineData("fec0::1")]
    public void Rejects_private_or_reserved_addresses(string value) =>
        Assert.False(TranslationSourceNetworkPolicy.IsPublic(IPAddress.Parse(value)));

    [Theory]
    [InlineData("1.1.1.1")]
    [InlineData("8.8.8.8")]
    [InlineData("2606:4700:4700::1111")]
    public void Allows_public_addresses(string value) =>
        Assert.True(TranslationSourceNetworkPolicy.IsPublic(IPAddress.Parse(value)));

    [Fact]
    public void Transport_handler_disables_redirects_and_proxies()
    {
        using var handler = TranslationSourceHttpHandler.Create(new TranslationSourceSecurityOptions());

        Assert.False(handler.AllowAutoRedirect);
        Assert.False(handler.UseProxy);
        Assert.NotNull(handler.ConnectCallback);
    }

    [Fact]
    public async Task Transport_handler_blocks_a_loopback_connection_before_connecting()
    {
        using var handler = TranslationSourceHttpHandler.Create(new TranslationSourceSecurityOptions());
        using var client = new HttpClient(handler);

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync("http://127.0.0.1:1/"));

        Assert.Contains("private or reserved", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Explicit_private_network_opt_in_allows_a_development_endpoint()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var responseTask = Task.Run(async () =>
        {
            using var connection = await listener.AcceptTcpClientAsync();
            await using var stream = connection.GetStream();
            using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
            while (!string.IsNullOrEmpty(await reader.ReadLineAsync())) { }
            await stream.WriteAsync("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"u8.ToArray());
        });
        using var handler = TranslationSourceHttpHandler.Create(new() { AllowPrivateNetworkEndpoints = true });
        using var client = new HttpClient(handler);

        var body = await client.GetStringAsync($"http://127.0.0.1:{port}/");
        await responseTask;

        Assert.Equal("ok", body);
    }
}
