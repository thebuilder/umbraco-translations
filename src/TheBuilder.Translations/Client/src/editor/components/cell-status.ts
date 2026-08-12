import type { MessageCell } from "../../api/generated/models.js";

export interface CellStatus {
  /** A sentence under the value, or null when the row is unremarkable. */
  text: string | null;
  /** True when it needs the editor to do something, rather than merely describing the state. */
  warning: boolean;
}

/**
 * What to say beneath a translation, and when to say nothing.
 *
 * Only rows that differ from the plain case are annotated. A note on every row reads as decoration
 * and hides the handful that actually need attention.
 */
export const cellStatus = (cell: MessageCell | undefined): CellStatus => {
  if (!cell) return { text: "Not translated", warning: false };

  switch (cell.state) {
    case "NeedsReview":
      return { text: "Application text changed since this was written", warning: true };
    case "Removed":
      return { text: "No longer in the application", warning: true };
    case "Overridden":
      return { text: "Customised", warning: false };
    default:
      // Most rows use the application text, and saying so on every one of them is noise that
      // buries the few rows that differ. Silence is the unremarkable case.
      return { text: null, warning: false };
  }
};

/** Counts for the summary line, so an editor can see the shape of the work before scrolling. */
export const summarise = (
  cells: readonly (MessageCell | undefined)[],
): { customised: number; needsReview: number; missing: number } => ({
  customised: cells.filter((cell) => cell?.hasOverride && cell.state !== "Removed").length,
  needsReview: cells.filter((cell) => cell?.state === "NeedsReview").length,
  missing: cells.filter((cell) => cell === undefined).length,
});
