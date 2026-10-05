import type { ReactNode } from "react";
import type { MessageKeyStatus } from "../../api/generated/models.js";
import type { SelectOption } from "../../bridge/uui/index.js";
import { Cross } from "../components/glyphs.js";
import { Caret, Picker } from "../components/picker.js";
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
  { value: "Overridden", label: "Custom text" },
  { value: "Default", label: "Default text" },
  { value: "NeedsReview", label: "Default changed" },
  { value: "Removed", label: "No longer used" },
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
  { value: "key", label: "Default order", sort: "key", direction: "asc" },
  { value: "recent", label: "Recently changed", sort: "updatedAt", direction: "desc" },
  { value: "attention", label: "Needing attention", sort: "status", direction: "asc" },
];

/** A menu over one qualifier: what it offers, where it is, and what picking one does. */
interface Menu {
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  value: string;
}

/**
 * The qualifiers on the list. They are chips and not menus because the failure mode of a row of
 * quiet dropdowns is an editor staring at an incomplete list without noticing that a status filter
 * is still on. A filter that is doing something is a chip that says so and can be taken off; a
 * filter that is doing nothing is a quiet menu offering to start.
 */
export const Filters = ({
  filters,
  namespaces,
  update,
}: {
  filters: EditorFilters;
  namespaces: readonly string[];
  update: (patch: Partial<EditorFilters>) => void;
}) => {
  const sort =
    SORTS.find(
      (option) => option.sort === filters.sort && option.direction === filters.direction
    ) ?? SORTS[0];
  const sorted = sort.value !== SORTS[0].value;
  const narrowed = hasNarrowingFilters(filters) || sorted;

  const namespace: Menu = {
    options: [
      { name: "Any namespace", value: "" },
      ...namespaces.map((name) => ({ name, value: name })),
    ],
    value: filters.namespace ?? "",
    // Changing namespace drops the key prefix with it: a path under one namespace names nothing
    // under another, and leaving it on is how a filter combination that can never match anything
    // gets built by accident.
    onChange: (value) => update({ namespace: value || null, keyPrefix: null }),
  };
  const status: Menu = {
    options: STATUSES.map((option) => ({ name: option.label, value: option.value })),
    value: filters.status,
    onChange: (value) => update({ status: value as MessageKeyStatus }),
  };
  const order: Menu = {
    options: SORTS.map((option) => ({ name: option.label, value: option.value })),
    value: sort.value,
    onChange: (value) => {
      const picked = SORTS.find((option) => option.value === value) ?? SORTS[0];
      update({ sort: picked.sort, direction: picked.direction });
    },
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: <fieldset> groups form controls; these are menus and buttons over filters already applied, and role="group" is what a fieldset maps to anyway, without the UA border and min-inline-size a flex row has to undo.
    <div aria-label="Filters" className="chips" role="group">
      {/* First rather than last: the group is aligned to the right, so anything appearing at its
          end would push every chip along. Appearing here, nothing already on screen moves. */}
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
          Clear
        </button>
      ) : null}

      {filters.namespace ? (
        <FilterChip
          label="Namespace"
          menu={namespace}
          onRemove={() => update({ namespace: null, keyPrefix: null })}
          prefix="Namespace"
        >
          {filters.namespace}
        </FilterChip>
      ) : (
        <FilterMenu label="Namespace" menu={namespace} />
      )}

      {/* No menu: a dotted path arrives from a link or from somebody typing it, and the useful
          thing to offer here is a way back out of it. */}
      {filters.keyPrefix ? (
        <FilterChip label="Under" onRemove={() => update({ keyPrefix: null })} prefix="Under">
          <span className="chip__code">{filters.keyPrefix}.</span>
        </FilterChip>
      ) : null}

      {/* No prefix on these two: "Not written" and "Needing attention" already say which dimension
          they are. */}
      {filters.status === defaultFilters.status ? (
        <FilterMenu label="Status" menu={status} />
      ) : (
        <FilterChip
          label="Status"
          menu={status}
          onRemove={() => update({ status: defaultFilters.status })}
        >
          {STATUSES.find((option) => option.value === filters.status)?.label}
        </FilterChip>
      )}

      {sorted ? (
        <FilterChip
          label="Sort"
          menu={order}
          onRemove={() =>
            update({ sort: defaultFilters.sort, direction: defaultFilters.direction })
          }
        >
          {sort.label}
        </FilterChip>
      ) : (
        <FilterMenu label="Sort" menu={order} />
      )}
    </div>
  );
};

/** A qualifier doing nothing: a quiet menu offering to start, named for what it would filter by. */
const FilterMenu = ({ label, menu }: { label: string; menu: Menu }) => (
  <Picker className="picker--add" label={label} {...menu}>
    {label}
    <Caret />
  </Picker>
);

/**
 * A qualifier doing something: a filled chip saying what, changed where it is read through the menu
 * behind its words, and taken off with its own button.
 *
 * No caret. The chip already carries one mark, the one that takes the filter off, and a second on a
 * pill this size is what made a row of three read as clutter. The pointer and the hover underline
 * say the words open a menu, which is where people reach for it anyway.
 */
const FilterChip = ({
  label,
  prefix,
  menu,
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
  /** Absent for a qualifier that can only be taken off, not changed in place. */
  menu?: Menu;
  onRemove: () => void;
  children: ReactNode;
}) => {
  const face = (
    <>
      {prefix ? <span className="chip__label">{prefix}</span> : null}
      <span className="chip__value">{children}</span>
    </>
  );

  return (
    <span className="chip">
      {menu ? (
        <Picker className="picker--chip" label={label} {...menu}>
          {face}
        </Picker>
      ) : (
        <span className="chip__face">{face}</span>
      )}
      <button
        aria-label={`Remove ${label.toLowerCase()} filter`}
        className="chip__remove"
        onClick={onRemove}
        type="button"
      >
        <Cross className="chip__cross" />
      </button>
    </span>
  );
};
