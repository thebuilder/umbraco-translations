import { type Ref, useEffect, useState } from "react";
import { Cross } from "../components/glyphs.js";
import type { EditorFilters } from "../state/filters.js";

/**
 * Search is the front door rather than a filter on a list: the job that brings an editor here most
 * often starts with a sentence somebody reported and no idea which key it is. So it gets the width,
 * and everything else that narrows the list sits in the bar above the results.
 */
export const SearchField = ({
  query,
  update,
  searchRef,
}: {
  query: string;
  update: (patch: Partial<EditorFilters>) => void;
  /** So a keystroke from anywhere in the editor can put the cursor here. */
  searchRef?: Ref<HTMLInputElement>;
}) => {
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);

  return (
    <div className="search">
      {/* Drawn inline rather than taken from the icon registry: that is a UUI custom element, and
          those do not upgrade inside this shadow root. */}
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
        placeholder="Search text or keys in any language"
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
      ) : (
        <span aria-hidden="true" className="search__key">
          /
        </span>
      )}
    </div>
  );
};
