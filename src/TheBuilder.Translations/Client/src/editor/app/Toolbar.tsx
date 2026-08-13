import { useEffect, useState } from "react";
import type { Ref } from "react";
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
  { value: "attention", label: "Needs attention", sort: "status", direction: "asc" },
];

/** Setting the comparison to the language being edited is how "no comparison" is expressed. */
const NO_COMPARISON = "";

/**
 * Three rows, each answering one question: which language am I editing, what am I looking for, and
 * which of the results am I looking at. Namespaces are a filter here rather than a sidebar -- there
 * are usually a handful, and a permanent column for them dominated the view they were narrowing.
 */
export const Toolbar = ({ filters, locales, namespaces, update, searchRef }: {
  filters: EditorFilters;
  locales: readonly LocaleFacet[];
  namespaces: readonly string[];
  update: (patch: Partial<EditorFilters>) => void;
  /** So a keystroke from anywhere in the editor can put the cursor here. */
  searchRef?: Ref<HTMLInputElement>;
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
      {/*
        Reads as a statement of what is being worked on rather than as a form. The two languages
        are the context every row is shown in, so they sit above the controls that narrow which
        rows those are, and the one being edited carries the weight.
      */}
      <div className="languages">
        <span className="languages__lead">Editing</span>
        <Select
          className="control--auto control--strong"
          label="Language being edited"
          options={options}
          value={editing ?? ""}
          onValueChange={(locale) =>
            // Carrying "no comparison" across a language change means moving it with the new
            // language, or the old one silently becomes the thing being compared against.
            update({ locale, referenceLocale: comparing ? filters.referenceLocale : locale })}
        />
        <span className="languages__lead">compared with</span>
        <Select
          className="control--auto"
          label="Language to compare against"
          options={comparisons}
          value={comparing ? filters.referenceLocale ?? "" : NO_COMPARISON}
          onValueChange={(value) => update({ referenceLocale: value || editing })}
        />
      </div>

      {/*
        One row, because these are one question: which of the translations am I looking at. Search
        takes the space and the three menus size to their own text, so the row reads as a search
        field with qualifiers rather than four equal boxes.
      */}
      <div className="filters">
        <div className="search">
          {/* Drawn inline rather than taken from the icon registry: that is a UUI custom element,
              and those do not upgrade inside this shadow root. */}
          <svg className="search__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.6 10.6 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <Input
            ref={searchRef}
            className="search__input"
            label="Search text and keys"
            placeholder="Search text or keys…"
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              update({ query: value });
            }}
          />
          {search && (
            <button
              type="button"
              className="search__clear"
              aria-label="Clear search"
              onClick={() => {
                setSearch("");
                update({ query: "" });
              }}
            >
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>

        <Select
          className="control--auto control--quiet"
          label="Namespace"
          options={[{ name: "Namespace: All", value: "" },
            ...namespaces.map((namespace) => ({ name: namespace, value: namespace }))]}
          value={filters.namespace ?? ""}
          onValueChange={(namespace) => update({ namespace: namespace || null, keyPrefix: null })}
        />
        <Select
          className="control--auto control--quiet"
          label="Status"
          options={STATUSES.map((status) => ({ name: status.label, value: status.value }))}
          value={filters.status}
          onValueChange={(status) => update({ status: status as MessageKeyStatus })}
        />
        <Select
          className="control--auto control--quiet"
          label="Sort order"
          options={SORTS.map((option) => ({ name: option.label, value: option.value }))}
          value={sort.value}
          onValueChange={(value) => {
            const picked = SORTS.find((option) => option.value === value) ?? SORTS[0]!;
            update({ sort: picked.sort, direction: picked.direction });
          }}
        />
      </div>
    </div>
  );
};

/** The language an editor recognises, with the code kept as the secondary detail it is. */
const describe = (locale: LocaleFacet): string =>
  locale.name && locale.name !== locale.code ? `${locale.name} (${locale.code})` : locale.code;
