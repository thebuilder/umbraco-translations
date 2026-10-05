import type { CellStatus } from "./cell-status.js";

/**
 * The one-word form of a state that asks the editor to decide something, coloured by which of the
 * two it is. Nothing at all for every other state: those are not worth a badge.
 */
export const StatusBadge = ({ status }: { status: CellStatus }) =>
  status.text ? (
    <span className={status.state === "Removed" ? "badge badge--danger" : "badge badge--warning"}>
      {status.text}
    </span>
  ) : null;
