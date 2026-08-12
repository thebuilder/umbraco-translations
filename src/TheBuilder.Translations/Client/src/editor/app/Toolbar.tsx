import { useEffect, useState } from "react";
import type { LocaleFacet, MessageKeyStatus } from "../../api/generated/models.js";
import { Input, Select, Tag } from "../../bridge/uui/index.js";
import type { EditorFilters } from "../state/filters.js";

const STATUSES: readonly { value: MessageKeyStatus; label: string }[] = [
  { value: "All", label: "All" },
  // "Absent" and "Removed" answer different questions: the application never shipped this locale,
  // versus it shipped the key and then withdrew it.
  { value: "Absent", label: "Not translated" },
  { value: "Default", label: "Using application text" },
  { value: "Overridden", label: "Edited here" },
  { value: "NeedsReview", label: "Needs review" },
  { value: "Removed", label: "Removed from source" },
];

export const Toolbar = ({ filters, locales, update }: {
  filters: EditorFilters;
  locales: readonly LocaleFacet[];
  update: (patch: Partial<EditorFilters>) => void;
}) => {
  // The input is uncontrolled between keystrokes so typing stays responsive while the committed
  // filter lags behind it; it resyncs when the filter changes from elsewhere, such as the back button.
  const [search, setSearch] = useState(filters.query);
  useEffect(() => setSearch(filters.query), [filters.query]);

  const localeOptions = locales.map((locale) => ({
    name: describe(locale),
    value: locale.code,
  }));

  return (
    <div className="toolbar">
      <div className="field">
        <label htmlFor="target">Translating</label>
        <Select
          label="Locale being edited"
          className="locale-select"
          options={localeOptions}
          value={filters.locale ?? ""}
          onValueChange={(locale) => update({ locale })}
        />
      </div>

      <div className="field">
        <label htmlFor="reference">Compared with</label>
        <Select
          label="Reference locale"
          className="locale-select"
          // Only locales with text can be translated from; an empty reference shows a page of blanks.
          options={localeOptions.filter((option) =>
            locales.find((locale) => locale.code === option.value)?.messageCount)}
          value={filters.referenceLocale ?? ""}
          onValueChange={(referenceLocale) => update({ referenceLocale })}
        />
      </div>

      <div className="field field--grow">
        <label htmlFor="search">Search</label>
        <Input
          label="Search keys and text"
          placeholder="Key or text"
          value={search}
          onValueChange={(value) => {
            setSearch(value);
            update({ query: value });
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="status">Show</label>
        <Select
          label="Status filter"
          options={STATUSES.map((status) => ({ name: status.label, value: status.value }))}
          value={filters.status}
          onValueChange={(status) => update({ status: status as MessageKeyStatus })}
        />
      </div>
    </div>
  );
};

/**
 * A locale reads as its name where the site still has one, and always as its code, because the code
 * is what appears in the source files an editor may be comparing against.
 */
const describe = (locale: LocaleFacet): string => {
  const suffix = locale.isConfigured ? "" : " (not a site language)";
  return locale.name ? `${locale.name} — ${locale.code}${suffix}` : `${locale.code}${suffix}`;
};

/** Shows how much of a locale is still untranslated, so the toolbar carries the work remaining. */
export const LocaleProgress = ({ locale, totalKeys }: { locale?: LocaleFacet; totalKeys: number }) => {
  if (!locale || totalKeys === 0) return null;
  const translated = totalKeys - locale.absentKeyCount;

  return (
    <div className="progress" aria-label={`${translated} of ${totalKeys} keys present in ${locale.code}`}>
      <Tag look={locale.absentKeyCount > 0 ? "secondary" : "default"}>
        {translated} / {totalKeys}
      </Tag>
      {locale.needsReviewCount > 0 && (
        <Tag color="warning">{locale.needsReviewCount} to review</Tag>
      )}
    </div>
  );
};
