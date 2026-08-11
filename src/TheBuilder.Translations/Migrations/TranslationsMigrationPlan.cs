using Umbraco.Cms.Core.Packaging;

namespace TheBuilder.Translations.Migrations;

internal sealed class TranslationsMigrationPlan : PackageMigrationPlan
{
    public TranslationsMigrationPlan() : base(Constants.PackageName) { }

    protected override void DefinePlan()
    {
        To<InstallTranslationSchema>(new Guid("1c435c16-eae2-48db-a8ba-86bd82f46743"));
        To<DeleteUnoverriddenRemovedMessages>(new Guid("951ebcc8-cb08-4091-99f8-cccb262976e1"));
        To<AddSynchronizationLease>(new Guid("7eb2327f-9b55-4ef0-938c-f325f26487be"));
    }
}
