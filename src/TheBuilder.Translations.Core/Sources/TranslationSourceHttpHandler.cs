using System.Net;
using System.Net.Sockets;

namespace TheBuilder.Translations.Core.Sources;

public static class TranslationSourceHttpHandler
{
    public static SocketsHttpHandler Create(TranslationSourceSecurityOptions options) => new()
    {
        AllowAutoRedirect = false,
        UseProxy = false,
        ConnectCallback = (context, cancellationToken) =>
            ConnectAsync(context.DnsEndPoint, options.AllowPrivateNetworkEndpoints, cancellationToken),
    };

    private static async ValueTask<Stream> ConnectAsync(
        DnsEndPoint endpoint,
        bool allowPrivateNetworkEndpoints,
        CancellationToken cancellationToken)
    {
        var addresses = IPAddress.TryParse(endpoint.Host, out var literal)
            ? [literal]
            : await Dns.GetHostAddressesAsync(endpoint.Host, cancellationToken);
        if (addresses.Length == 0)
            throw new HttpRequestException($"The translation source host '{endpoint.Host}' did not resolve to an address.");
        if (!allowPrivateNetworkEndpoints && addresses.Any(address => !TranslationSourceNetworkPolicy.IsPublic(address)))
            throw new HttpRequestException("The translation source resolved to a private or reserved network address.");

        Exception? lastFailure = null;
        foreach (var address in addresses)
        {
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, endpoint.Port), cancellationToken);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch (Exception exception)
            {
                socket.Dispose();
                if (exception is OperationCanceledException)
                    throw;
                lastFailure = exception;
            }
        }

        throw new HttpRequestException($"The translation source host '{endpoint.Host}' could not be reached.", lastFailure);
    }
}

public static class TranslationSourceNetworkPolicy
{
    private static readonly byte[] Ipv4CompatiblePrefix = new byte[12];
    private static readonly byte[] Nat64Prefix = [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0];

    public static bool IsPublic(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6)
            return IsPublic(address.MapToIPv4());
        if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any) ||
            address.Equals(IPAddress.None) || address.Equals(IPAddress.IPv6None))
            return false;

        var bytes = address.GetAddressBytes();
        return address.AddressFamily switch
        {
            AddressFamily.InterNetwork => IsPublicIpv4(bytes),
            AddressFamily.InterNetworkV6 => IsPublicIpv6(bytes),
            _ => false,
        };
    }

    private static bool IsPublicIpv4(byte[] bytes) => bytes switch
    {
        [0, ..] => false,
        [10, ..] => false,
        [100, >= 64 and <= 127, ..] => false,
        [127, ..] => false,
        [169, 254, ..] => false,
        [172, >= 16 and <= 31, ..] => false,
        [192, 0, 0, ..] => false,
        [192, 0, 2, ..] => false,
        [192, 168, ..] => false,
        [198, 18 or 19, ..] => false,
        [198, 51, 100, ..] => false,
        [203, 0, 113, ..] => false,
        [>= 224, ..] => false,
        _ => true,
    };

    private static bool IsPublicIpv6(byte[] bytes)
    {
        if (bytes.AsSpan(0, 12).SequenceEqual(Ipv4CompatiblePrefix))
            return false;
        if (bytes.AsSpan(0, 12).SequenceEqual(Nat64Prefix))
            return IsPublicIpv4(bytes[12..]);
        if (bytes[0] == 0x20 && bytes[1] == 0x02)
            return IsPublicIpv4(bytes[2..6]);

        return (bytes[0] & 0xfe) != 0xfc &&
               !(bytes[0] == 0xfe && (bytes[1] & 0xc0) is 0x80 or 0xc0) &&
               bytes[0] != 0xff &&
               !(bytes[0] == 0x20 && bytes[1] == 0x01 && bytes[2] == 0x0d && bytes[3] == 0xb8);
    }
}
