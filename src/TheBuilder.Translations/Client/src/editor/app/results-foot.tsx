import type { LocaleFacet } from "../../api/generated/models.js";
import { Shortcuts } from "../components/shortcuts.js";

/**
 * What the whole site looks like, under a list showing part of it.
 *
 * The counts are secondary, and said again in the strip at the top, so they are what goes first
 * when the editing pane takes half the width. The shortcuts are not repeated anywhere, so they
 * stay.
 */
export const ResultsFoot = ({
  totalKeys,
  namespace,
  current,
  syncing,
  viewOnly,
  editing,
}: {
  totalKeys: number;
  /** The namespace filter, so the total says what it is a total of. */
  namespace: string | null;
  current?: LocaleFacet;
  syncing: boolean;
  /** Known to be view-only, as opposed to not yet known either way. */
  viewOnly: boolean;
  editing: boolean;
}) => (
  <div className="results__foot">
    <span>
      <strong>{totalKeys.toLocaleString()}</strong> keys
      {namespace ? <> in {namespace}</> : null}
    </span>

    {current && current.absentKeyCount > 0 ? (
      <span className="results__aside">
        {current.absentKeyCount.toLocaleString()} not written in {current.name || current.code}
      </span>
    ) : null}
    {current && current.needsReviewCount > 0 ? (
      <span className="results__aside results__warning">
        {current.needsReviewCount.toLocaleString()} changed upstream
      </span>
    ) : null}

    <span className="results__spacer" />
    {syncing ? <span role="status">Syncing…</span> : null}
    {viewOnly ? <span>View-only access</span> : null}
    <Shortcuts editing={editing} />
  </div>
);
