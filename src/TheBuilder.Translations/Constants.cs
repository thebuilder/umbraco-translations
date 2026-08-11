namespace TheBuilder.Translations;

public static class Constants
{
    public const string PackageName = "TheBuilder.Translations";
    public const string ApiName = "thebuildertranslations";
    public const string AutomationApiName = "thebuildertranslationsautomation";
    public const string ApiRoot = "management/api/v{version:apiVersion}/translations";
    public const string DeliveryApiRoot = "delivery/api/v{version:apiVersion}/translations";
    public const string AutomationApiRoot = "umbraco/translations/api/v{version:apiVersion}";

    public static class Tables
    {
        public const string Sources = "theBuilderTranslationSource";
        public const string Messages = "theBuilderTranslationMessage";
        public const string Overrides = "theBuilderTranslationOverride";
        public const string Syncs = "theBuilderTranslationSync";
    }
}
