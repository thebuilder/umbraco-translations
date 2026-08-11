using System.Security.Cryptography;
using System.Text;

namespace TheBuilder.Translations.Core.Messages;

public static class TranslationMessageFingerprint
{
    public static string Compute(string value, MessageFormat format, IReadOnlyDictionary<string, string> arguments)
    {
        var signature = new StringBuilder(value).Append('\0').Append(format);
        foreach (var argument in arguments.OrderBy(item => item.Key, StringComparer.Ordinal))
            signature.Append('\0').Append(argument.Key).Append('=').Append(argument.Value);
        return Hash(signature.ToString());
    }

    public static string LegacyValueOnly(string value) => Hash(value);

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
