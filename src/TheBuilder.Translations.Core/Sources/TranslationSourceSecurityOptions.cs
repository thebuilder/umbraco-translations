namespace TheBuilder.Translations.Core.Sources;

public sealed class TranslationSourceSecurityOptions
{
    public const string SectionName = "TheBuilder:Translations:SourceSecurity";

    public bool AllowPrivateNetworkEndpoints { get; init; }
}
