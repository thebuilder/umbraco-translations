import { useEffect, useState } from "react";
import type { ReactNode, Ref } from "react";
import type { MessageKeyStatus } from "../../api/generated/models.js";
import type { SelectOption } from "../../bridge/uui/index.js";
import { Caret, Picker } from "../components/Picker.js";
import { defaultFilters, type EditorFilters, type SortDirection, type SortField } from "../state/filters.js";
import { clearedFilters, hasNarrowingFilters } from "../state/list-state.js";

const STATUSES: readonly { value: MessageKeyStatus; label: string }[] = [
  { value: "All", label: "Any status" },
  { value: "Absent", label: "Not written" },
  { value: "Overridden", label: "Your own text" },
  { value: "Default", label: "Application text" },
  { value: "NeedsReview", label: "Changed upstream" },
  { value: "Removed", label: "Gone from the application" },
];

/**
 * The orders an editor can put the list in, each a whole choice rather than a field and a direction
 * to combine. Nobody wants the least recently edited message first, so the direction is part of the
 * option and not a second control to get wrong.
 */
const SORTS: readonly { value: string; label: string; sort: SortField; direction: SortDirection }[] = [
  { value: "key", label: "The order the application defines them", sort: "key", direction: "asc" },
  { value: "recent", label: "Recently changed first", sort: "updatedAt", direction: "desc" },
  { value: "attention", label: "Needing attention first", sort: "status", direction: "asc" },
];

/**
 * Search, and the qualifiers around it.
 *
 * Search is the front door rather than a filter on a list: the job that brings an editor here most
 * often starts with a sentence somebody reported and no idea which key it is. So it gets the width
 * and the type size, and everything else is a chip beneath it.
 *
 * The qualifiers are chips and not menus because the failure mode of a row of quiet dropdowns is an
 * editor staring at an incomplete list without noticing that a status filter is still on. A filter
 * that is doing something is a chip that says so and can be taken off; a filter that is doing
 * nothing is a dashed outline offering to start.
 */
export const FilterBar = ({ filters, namespaces, update, searchRef }: {
  filters: EditorFilters;
  namespaces: readonly string[];
  update: (patch: Partial<EditorFilters>) => void;
  /** So a keystroke from anywhere in the editor can put the cursor here. */
  searchRef?: Ref<HTMLInputElement>;
}) => {
  const [search, setSearch] = useState(filters.query);
  useEffect(() => setSearch(filters.query), [filters.query]);

  const sort = SORTS.find((option) =>
    option.sort === filters.sort && option.direction === filters.direction) ?? SORTS[0]!;
  const sorted = sort.value !== SORTS[0]!.value;

  const namespaceOptions: SelectOption[] = [
    { name: "Any namespace", value: "" },
    ...namespaces.map((namespace) => ({ name: namespace, value: namespace })),
  ];

  const narrowed = hasNarrowingFilters(filters) || sorted;

  return (
    <div className="finder">
      <div className="search">
        {/* Drawn inline rather than taken from the icon registry: that is a UUI custom element,
            and those do not upgrade inside this shadow root. */}
        <svg className="search__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10.6 10.6 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={searchRef}
          type="text"
          className="search__input"
          aria-label="Search text and keys"
          placeholder="Search the text or the key…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            update({ query: event.target.value });
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

      <div className="chips">
        <span className="chips__lead">Filters</span>

        <Chip
          label="Namespace"
          picker="Namespace"
          options={namespaceOptions}
          value={filters.namespace ?? ""}
          // Changing namespace drops the key prefix with it: a path under one namespace names
          // nothing under another, and leaving it on is how a filter combination that can never
          // match anything gets built by accident.
          onChange={(namespace) => update({ namespace: namespace || null, keyPrefix: null })}
          onRemove={filters.namespace ? () => update({ namespace: null, keyPrefix: null }) : undefined}
        >
          {filters.namespace}
        </Chip>

        {/* No menu: a dotted path arrives from a link or from somebody typing it, and the useful
            thing to offer here is a way back out of it. */}
        {filters.keyPrefix && (
          <Chip label="Under" onRemove={() => update({ keyPrefix: null })}>
            <span className="chip__code">{filters.keyPrefix}.</span>
          </Chip>
        )}

        <Chip
          label="Showing"
          picker="Status"
          options={STATUSES.map((status) => ({ name: status.label, value: status.value }))}
          value={filters.status}
          onChange={(status) => update({ status: status as MessageKeyStatus })}
          onRemove={filters.status === defaultFilters.status
            ? undefined
            : () => update({ status: defaultFilters.status })}
        >
          {filters.status === defaultFilters.status
            ? null
            : STATUSES.find((status) => status.value === filters.status)?.label}
        </Chip>

        <Chip
          label="Sorted by"
          picker="Sort"
          options={SORTS.map((option) => ({ name: option.label, value: option.value }))}
          value={sort.value}
          onChange={(value) => {
            const picked = SORTS.find((option) => option.value === value) ?? SORTS[0]!;
            update({ sort: picked.sort, direction: picked.direction });
          }}
          onRemove={sorted
            ? () => update({ sort: defaultFilters.sort, direction: defaultFilters.direction })
            : undefined}
        >
          {sorted ? sort.label : null}
        </Chip>

        <span className="chips__spacer" />

        {narrowed && (
          <button
            type="button"
            className="link"
            // Clears every qualifier without touching which languages the list is about: those are
            // the context, not something being filtered by.
            onClick={() => update({
              ...clearedFilters(),
              sort: defaultFilters.sort,
              direction: defaultFilters.direction,
            })}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * One qualifier. Set, it is a filled chip naming what it is doing with a way to take it off; unset,
 * a dashed outline offering to add it. Both are the same control underneath, so a filter is changed
 * where it is read rather than by finding the menu it came from.
 */
const Chip = ({ label, picker, options, value, onChange, onRemove, children }: {
  label: string;
  /** The word the dashed outline offers, when there is a menu behind it. */
  picker?: string;
  options?: readonly SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  onRemove?: () => void;
  children?: ReactNode;
}) => {
  const set = onRemove !== undefined;

  if (!set && options !== undefined && onChange !== undefined) {
    return (
      <Picker className="picker--add" label={picker ?? label} options={options} value={value ?? ""} onChange={onChange}>
        <span aria-hidden="true">+</span> {picker ?? label}
      </Picker>
    );
  }

  const face = (
    <>
      <span className="chip__label">{label}</span>
      <span className="chip__value">{children}</span>
    </>
  );

  return (
    <span className="chip">
      {options !== undefined && onChange !== undefined ? (
        <Picker className="picker--chip" label={picker ?? label} options={options} value={value ?? ""} onChange={onChange}>
          {face}
          <Caret />
        </Picker>
      ) : (
        <span className="chip__face">{face}</span>
      )}
      {onRemove && (
        <button type="button" className="chip__remove" aria-label={`Remove ${label.toLowerCase()} filter`} onClick={onRemove}>
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </span>
  );
};
