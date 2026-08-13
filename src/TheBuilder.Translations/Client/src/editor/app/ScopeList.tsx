import type { EditorFilters } from "../state/filters.js";

/**
 * Scopes the list to one namespace.
 *
 * Namespaces are developer grouping, so they belong in navigation rather than repeated on every
 * row. This is the flat form of that idea; the drill-down tree over key prefixes replaces it once
 * the endpoint that counts them exists, and the selection model here is what it will extend.
 */
export const ScopeList = ({ namespaces, filters, update }: {
  namespaces: readonly string[];
  filters: EditorFilters;
  update: (patch: Partial<EditorFilters>) => void;
}) => (
  <nav className="scope" aria-label="Namespaces">
    <ul>
      <li>
        <button
          type="button"
          className={filters.namespace === null ? "scope__item scope__item--current" : "scope__item"}
          aria-current={filters.namespace === null}
          onClick={() => update({ namespace: null, keyPrefix: null })}
        >
          All namespaces
        </button>
      </li>
      {namespaces.map((namespace) => (
        <li key={namespace}>
          <button
            type="button"
            className={filters.namespace === namespace ? "scope__item scope__item--current" : "scope__item"}
            aria-current={filters.namespace === namespace}
            // Changing namespace clears any key prefix beneath it, which would otherwise scope the
            // list to a subtree of a namespace it no longer belongs to and show nothing.
            onClick={() => update({ namespace, keyPrefix: null })}
          >
            {namespace}
          </button>
        </li>
      ))}
    </ul>
  </nav>
);
