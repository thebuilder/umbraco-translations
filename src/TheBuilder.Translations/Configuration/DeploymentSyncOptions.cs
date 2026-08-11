namespace TheBuilder.Translations.Configuration;

public sealed class DeploymentSyncOptions
{
    public const string SectionName = "TheBuilder:Translations:DeploymentSync";
    public const string ApiKeyConfigurationName = $"{SectionName}:ApiKey";

    public string? ApiKey { get; set; }
}
