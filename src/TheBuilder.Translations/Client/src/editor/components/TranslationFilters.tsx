import type { EditorFilters } from "../filter-state.js";
import { parseMessageStatus } from "../filter-state.js";

export const TranslationFilters = ({ filters, update }: {
  filters: EditorFilters;
  update: (patch: Partial<EditorFilters>) => void;
}) => <div className="toolbar">
  <div className="field">
    <label htmlFor="locale">Locale</label>
    <input id="locale" value={filters.locale} onChange={event => update({ locale: event.target.value, page: 1 })} placeholder="da" />
  </div>
  <div className="field">
    <label htmlFor="namespace">Namespace</label>
    <input id="namespace" value={filters.namespace} onChange={event => update({ namespace: event.target.value, page: 1 })} placeholder="website" />
  </div>
  <div className="field">
    <label htmlFor="search">Search</label>
    <input id="search" type="search" value={filters.query} onChange={event => update({ query: event.target.value, page: 1 })} placeholder="Key or text" />
  </div>
  <div className="field">
    <label htmlFor="status">Status</label>
    <select id="status" value={filters.status} onChange={event => update({ status: parseMessageStatus(event.target.value), page: 1 })}>
      <option>All</option><option>Default</option><option>Overridden</option><option>NeedsReview</option><option value="Missing">Removed</option>
    </select>
  </div>
</div>;
