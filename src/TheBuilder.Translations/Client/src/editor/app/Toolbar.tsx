import { useEffect, useState } from "react";
import type { LocaleFacet, MessageKeyStatus } from "../../api/generated/models.js";
import { Input, Select } from "../../bridge/uui/index.js";
import type { EditorFilters } from "../state/filters.js";

const STATUSES: readonly { value: MessageKeyStatus; label: string }[] = [
  { value: "All", label: "Show all" },
  { value: "Absent", label: "Not translated" },
  { value: "Overridden", label: "Customised here" },
  { value: "NeedsReview", label: "Needs review" },
  { value: "Default", label: "Using application text" },
  { value: "Removed", label: "Removed from source" },
];

/**
 * Two rows: what you are looking at, then how you are narrowing it. Namespaces are a filter here
 * rather than a sidebar -- there are usually a handful, and a permanent column for them dominated
 * the view they were meant to narrow.
 */
export const Toolbar = ({ filters, locales, namespaces, update }: {
  filters: EditorFilters;
  locales: readonly LocaleFacet[];
  namespaces: readonly string[];
  update: (patch: Partial<EditorFilters>) => void;
}) => {
  const [search, setSearch] = useState(filters.query);
  useEffect(() => setSearch(filters.query), [filters.query]);

  const localeOptions = locales.map((locale) => ({ name: describe(locale), value: locale.code }));
  const translatable = localeOptions.filter((option) =>
    locales.find((locale) => locale.code === option.value)?.messageCount);

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <label className="field">
          <span>Translating</span>
          <Select
            label="Locale being edited"
            options={localeOptions}
            value={filters.locale ?? ""}
            onValueChange={(locale) => update({ locale })}
          />
        </label>
        <label className="field">
          <span>Compared with</span>
          <Select
            label="Reference locale"
            options={translatable}
            value={filters.referenceLocale ?? ""}
            onValueChange={(referenceLocale) => update({ referenceLocale })}
          />
        </label>
      </div>

      <div className="toolbar__row">
        <label className="field field--grow">
          <span className="visually-hidden">Search</span>
          <Input
            label="Search keys and text"
            placeholder="Search keys or text…"
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              update({ query: value });
            }}
          />
        </label>
        <label className="field">
          <span className="visually-hidden">Namespace</span>
          <Select
            label="Namespace"
            options={[{ name: "All namespaces", value: "" },
              ...namespaces.map((namespace) => ({ name: namespace, value: namespace }))]}
            value={filters.namespace ?? ""}
            onValueChange={(namespace) => update({ namespace: namespace || null, keyPrefix: null })}
          />
        </label>
        <label className="field">
          <span className="visually-hidden">Show</span>
          <Select
            label="Status filter"
            options={STATUSES.map((status) => ({ name: status.label, value: status.value }))}
            value={filters.status}
            onValueChange={(status) => update({ status: status as MessageKeyStatus })}
          />
        </label>
      </div>
    </div>
  );
};

const describe = (locale: LocaleFacet): string =>
  locale.name && locale.name !== locale.code ? `${locale.name} — ${locale.code}` : locale.code;
