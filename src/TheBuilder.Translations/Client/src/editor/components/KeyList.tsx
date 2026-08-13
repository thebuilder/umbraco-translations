import type { MessageCell, MessageKey } from "../../api/generated/models.js";
import { Button, Tag } from "../../bridge/uui/index.js";
import { displayKey } from "./row-metrics.js";
import type { EditorFilters } from "../state/filters.js";

/**
 * One row per key, reference text beside the locale being edited.
 *
 * Read-only for now: the virtualized grid with inline editing replaces this, and doing so is why
 * the row is expressed as a pure function of a key plus the current scope rather than reaching for
 * filters itself.
 */
export const KeyList = ({ keys, filters, total, loading, error, namespaceCount, onSelect, onLoadMore, hasMore, loadingMore }: {
  keys: readonly MessageKey[];
  filters: EditorFilters;
  total: number;
  loading: boolean;
  error?: Error;
  namespaceCount: number;
  onSelect: (messageId: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}) => {
  if (error) return <p className="panel error">{error.message}</p>;
  if (loading) return <p className="panel">Loading translations…</p>;
  if (keys.length === 0) return <p className="panel">No translations match these filters.</p>;

  return (
    <div className="key-list">
      <table>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">{filters.referenceLocale ?? "Reference"}</th>
            <th scope="col">{filters.locale ?? "Translation"}</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const target = filters.locale ? key.cells[filters.locale] : undefined;
            const reference = filters.referenceLocale ? key.cells[filters.referenceLocale] : undefined;
            const shown = displayKey(key, filters, namespaceCount);

            return (
              <tr
                key={`${key.sourceId}|${key.namespace}|${key.key}`}
                onClick={() => target && onSelect(target.id)}
              >
                <td>
                  {shown.showNamespace && <div className="muted">{key.namespace}</div>}
                  <div className="key" title={`${key.namespace}.${key.key}`}>{shown.text}</div>
                </td>
                <td className="muted"><Value cell={reference} /></td>
                <td><Value cell={target} /></td>
                <td><Status cell={target} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="pagination">
        <span className="muted">
          {keys.length === total ? `${total} keys` : `${keys.length} of ${total} keys`}
        </span>
        {hasMore && (
          <Button disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Three states are easy to confuse and none may render as an empty cell: no row at all, a row using
 * the application's text, and an override that is deliberately the empty string.
 */
const Value = ({ cell }: { cell?: MessageCell }) => {
  if (!cell) return <span className="absent">— not translated</span>;

  const text = cell.overrideValue ?? cell.defaultValue;
  if (text === "") return <span className="absent">∅ empty string</span>;

  return (
    <span className={cell.hasOverride ? undefined : "inherited"}>
      {cell.hasOverride ? "" : "↳ "}
      {text}
    </span>
  );
};

/** No chip on the ordinary case: a chip on every row is not a signal. */
const Status = ({ cell }: { cell?: MessageCell }) => {
  if (!cell) return null;
  switch (cell.state) {
    case "NeedsReview":
      return <Tag color="warning">Needs review</Tag>;
    case "Removed":
      return <Tag color="danger">Removed</Tag>;
    case "Overridden":
      return <Tag>Edited</Tag>;
    default:
      return null;
  }
};
