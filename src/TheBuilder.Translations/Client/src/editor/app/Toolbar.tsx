import { useEffect, useState } from "react";
import type { LocaleFacet, MessageKeyStatus } from "../../api/generated/models.js";
import { Input, Select } from "../../bridge/uui/index.js";
import type { EditorFilters, SortDirection, SortField } from "../state/filters.js";

const STATUSES: readonly { value: MessageKeyStatus; label: string }[] = [
  { value: "All", label: "Status: All" },
  { value: "Absent", label: "Not translated" },
  { value: "Overridden", label: "Custom text" },
  { value: "Default", label: "Application text" },
  { value: "NeedsReview", label: "Needs review" },
  { value: "Removed", label: "Missing from source" },
];

/**
 * The orders an editor can put the list in, each a whole choice rather than a field and a direction
 * to combine. Nobody wants the least recently edited message first, so the direction is part of the
 * option and not a second control to get wrong.
 */
const SORTS: readonly { value: string; label: string; sort: SortField; direction: SortDirection }[] = [
  { value: "key", label: "Sort: Key", sort: "key", direction: "asc" },
  { value: "recent", label: "Recently updated", sort: "updatedAt", direction: "desc" },
  { value: "attention", label: "Needs attention first", sort: "status", direction: "asc" },
];

/** Setting the comparison to the language being edited is how "no comparison" is expressed. */
const NO_COMPARISON = "";

/**
 * Three rows, each answering one question: which language am I editing, what am I looking for, and
 * which of the results am I looking at. Namespaces are a filter here rather than a sidebar -- there
 * are usually a handful, and a permanent column for them dominated the view they were narrowing.
 */
export const Toolbar = ({ filters, locales, namespaces, update }: {
  filters: EditorFilters;
  locales: readonly LocaleFacet[];
  namespaces: readonly string[];
  update: (patch: Partial<EditorFilters>) => void;
}) => {
  const [search, setSearch] = useState(filters.query);
  useEffect(() => setSearch(filters.query), [filters.query]);

  const editing = filters.locale;
  const comparing = filters.referenceLocale !== null && filters.referenceLocale !== editing;

  const options = locales.map((locale) => ({ name: describe(locale), value: locale.code }));
  // A comparison is only useful against a language that has something to compare with, and never
  // against the language being edited -- that is the same column printed twice.
  const comparisons = [
    { name: "None", value: NO_COMPARISON },
    ...options.filter((option) =>
      option.value !== editing &&
      locales.find((locale) => locale.code === option.value)?.messageCount),
  ];

  const sort = SORTS.find((option) =>
    option.sort === filters.sort && option.direction === filters.direction) ?? SORTS[0]!;

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <label className="field">
          <span>Editing language</span>
          <Select
            label="Language being edited"
            options={options}
            value={editing ?? ""}
            onValueChange={(locale) =>
              // Carrying "no comparison" across a language change means moving it with the new
              // language, or the old one silently becomes the thing being compared against.
              update({ locale, referenceLocale: comparing ? filters.referenceLocale : locale })}
          />
        </label>
        <label className="field field--secondary">
          <span>Compare with</span>
          <Select
            label="Language to compare against"
            options={comparisons}
            value={comparing ? filters.referenceLocale ?? "" : NO_COMPARISON}
            onValueChange={(value) => update({ referenceLocale: value || editing })}
          />
        </label>
      </div>

      <div className="toolbar__row">
        <label className="field field--grow">
          <span className="visually-hidden">Search</span>
          <Input
            label="Search text and keys"
            placeholder="Search text or keys…"
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              update({ query: value });
            }}
          />
        </label>
      </div>

      <div className="toolbar__row toolbar__row--filters">
        <label className="field">
          <span className="visually-hidden">Namespace</span>
          <Select
            label="Namespace"
            options={[{ name: "Namespace: All", value: "" },
              ...namespaces.map((namespace) => ({ name: namespace, value: namespace }))]}
            value={filters.namespace ?? ""}
            onValueChange={(namespace) => update({ namespace: namespace || null, keyPrefix: null })}
          />
        </label>
        <label className="field">
          <span className="visually-hidden">Status</span>
          <Select
            label="Status"
            options={STATUSES.map((status) => ({ name: status.label, value: status.value }))}
            value={filters.status}
            onValueChange={(status) => update({ status: status as MessageKeyStatus })}
          />
        </label>
        <label className="field">
          <span className="visually-hidden">Sort</span>
          <Select
            label="Sort order"
            options={SORTS.map((option) => ({ name: option.label, value: option.value }))}
            value={sort.value}
            onValueChange={(value) => {
              const picked = SORTS.find((option) => option.value === value) ?? SORTS[0]!;
              update({ sort: picked.sort, direction: picked.direction });
            }}
          />
        </label>
      </div>
    </div>
  );
};

/** The language an editor recognises, with the code kept as the secondary detail it is. */
const describe = (locale: LocaleFacet): string =>
  locale.name && locale.name !== locale.code ? `${locale.name} (${locale.code})` : locale.code;
