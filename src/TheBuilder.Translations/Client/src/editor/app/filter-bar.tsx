import type { ReactNode, Ref } from "react";
import { useEffect, useState } from "react";
import type { MessageKeyStatus } from "../../api/generated/models.js";
import type { SelectOption } from "../../bridge/uui/index.js";
import { Cross } from "../components/glyphs.js";
import { Picker } from "../components/picker.js";
import {
  defaultFilters,
  type EditorFilters,
  type SortDirection,
  type SortField,
} from "../state/filters.js";
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
const SORTS: readonly {
  value: string;
  label: string;
  sort: SortField;
  direction: SortDirection;
}[] = [
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
export const FilterBar = ({
  filters,
  namespaces,
  update,
  searchRef,
}: {
  filters: EditorFilters;
  namespaces: readonly string[];
  update: (patch: Partial<EditorFilters>) => void;
  /** So a keystroke from anywhere in the editor can put the cursor here. */
  searchRef?: Ref<HTMLInputElement>;
}) => {
  const [search, setSearch] = useState(filters.query);
  useEffect(() => setSearch(filters.query), [filters.query]);

  const sort =
    SORTS.find(
      (option) => option.sort === filters.sort && option.direction === filters.direction
    ) ?? SORTS[0];
  const sorted = sort.value !== SORTS[0].value;

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
        <svg aria-hidden="true" className="search__icon" focusable="false" viewBox="0 0 16 16">
          <circle cx="7" cy="7" fill="none" r="4.5" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M10.6 10.6 14 14"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </svg>
        <input
          aria-label="Search text and keys"
          className="search__input"
          onChange={(event) => {
            setSearch(event.target.value);
            update({ query: event.target.value });
          }}
          placeholder="Search the text or the key…"
          ref={searchRef}
          type="text"
          value={search}
        />
        {search ? (
          <button
            aria-label="Clear search"
            className="search__clear"
            onClick={() => {
              setSearch("");
              update({ query: "" });
            }}
            type="button"
          >
            <Cross className="search__cross" />
          </button>
        ) : null}
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: <fieldset> groups form controls; these are
          buttons that clear filters already applied, not inputs. role="group" is what a fieldset
          maps to anyway, without the UA border and the min-inline-size: min-content that a flex
          row has to undo. */}
      <div aria-label="Filters" className="chips" role="group">
        <Chip
          label="Namespace"
          // Changing namespace drops the key prefix with it: a path under one namespace names
          // nothing under another, and leaving it on is how a filter combination that can never
          // match anything gets built by accident.
          onChange={(namespace) => update({ namespace: namespace || null, keyPrefix: null })}
          onRemove={
            filters.namespace ? () => update({ namespace: null, keyPrefix: null }) : undefined
          }
          options={namespaceOptions}
          picker="Namespace"
          prefix="Namespace"
          value={filters.namespace ?? ""}
        >
          {filters.namespace}
        </Chip>

        {/* No menu: a dotted path arrives from a link or from somebody typing it, and the useful
            thing to offer here is a way back out of it. */}
        {filters.keyPrefix ? (
          <Chip label="Under" onRemove={() => update({ keyPrefix: null })} prefix="Under">
            <span className="chip__code">{filters.keyPrefix}.</span>
          </Chip>
        ) : null}

        {/* No prefix on either of these: "Not written" and "Needing attention first" already say
            which dimension they are, and "Showing" in front of one is a word that adds nothing. */}
        <Chip
          label="Showing"
          onChange={(status) => update({ status: status as MessageKeyStatus })}
          onRemove={
            filters.status === defaultFilters.status
              ? undefined
              : () => update({ status: defaultFilters.status })
          }
          options={STATUSES.map((status) => ({ name: status.label, value: status.value }))}
          picker="Status"
          value={filters.status}
        >
          {filters.status === defaultFilters.status
            ? null
            : STATUSES.find((status) => status.value === filters.status)?.label}
        </Chip>

        <Chip
          label="Sorted by"
          onChange={(value) => {
            const picked = SORTS.find((option) => option.value === value) ?? SORTS[0];
            update({ sort: picked.sort, direction: picked.direction });
          }}
          onRemove={
            sorted
              ? () => update({ sort: defaultFilters.sort, direction: defaultFilters.direction })
              : undefined
          }
          options={SORTS.map((option) => ({ name: option.label, value: option.value }))}
          picker="Sort"
          value={sort.value}
        >
          {sorted ? sort.label : null}
        </Chip>

        <span className="chips__spacer" />

        {narrowed ? (
          <button
            className="link"
            // Clears every qualifier without touching which languages the list is about: those are
            // the context, not something being filtered by.
            onClick={() =>
              update({
                ...clearedFilters(),
                sort: defaultFilters.sort,
                direction: defaultFilters.direction,
              })
            }
            type="button"
          >
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
};

/**
 * One qualifier. Set, it is a filled chip naming what it is doing with a way to take it off; unset,
 * a dashed outline offering to add it. Both are the same control underneath, so a filter is changed
 * where it is read rather than by finding the menu it came from.
 */
const Chip = ({
  label,
  prefix,
  picker,
  options,
  value,
  onChange,
  onRemove,
  children,
}: {
  /** Names the dimension to a screen reader and to the remove button, whether or not it is drawn. */
  label: string;
  /**
   * The dimension spelled out on the chip, for a value that does not name its own. A namespace is
   * an opaque word and needs one; "Not written" is a whole sentence about itself and does not.
   */
  prefix?: string;
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
      <Picker
        className="picker--add"
        label={picker ?? label}
        onChange={onChange}
        options={options}
        value={value ?? ""}
      >
        <span aria-hidden="true">+</span> {picker ?? label}
      </Picker>
    );
  }

  const face = (
    <>
      {prefix ? <span className="chip__label">{prefix}</span> : null}
      <span className="chip__value">{children}</span>
    </>
  );

  /*
   * No caret. The chip already carries one mark, the one that takes the filter off, and a second on
   * a pill this size is what made a row of three read as clutter. What is left is the value and the
   * control that removes it. The pointer and the hover underline say the words open a menu, which
   * is where people reach for it anyway.
   */
  return (
    <span className="chip">
      {options !== undefined && onChange !== undefined ? (
        <Picker
          className="picker--chip"
          label={picker ?? label}
          onChange={onChange}
          options={options}
          value={value ?? ""}
        >
          {face}
        </Picker>
      ) : (
        <span className="chip__face">{face}</span>
      )}
      {onRemove ? (
        <button
          aria-label={`Remove ${label.toLowerCase()} filter`}
          className="chip__remove"
          onClick={onRemove}
          type="button"
        >
          <Cross className="chip__cross" />
        </button>
      ) : null}
    </span>
  );
};
