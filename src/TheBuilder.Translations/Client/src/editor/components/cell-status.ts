import type { MessageCell } from "../../api/generated/models.js";

export interface CellStatus {
  /** Custom text has been written here. A mark beside the value, never a sentence under it. */
  custom: boolean;
  /** Said in words only when the editor has to decide something about it. */
  text: string | null;
  warning: boolean;
}

/**
 * What to say beside a translation, and when to say nothing.
 *
 * The two are different questions. "This has custom text" is true of a great many rows and gets a
 * mark, because spelling it out under each one is a label repeated down the whole column that
 * buries the rows that actually need attention. "The application text changed underneath this" is
 * rare and asks the editor to do something, so it gets words.
 */
export const cellStatus = (cell: MessageCell | undefined): CellStatus => {
  // Nothing to mark: the value itself renders as "Not translated", which already says it.
  if (!cell) return { custom: false, text: null, warning: false };

  switch (cell.state) {
    case "NeedsReview":
      return { custom: cell.hasOverride, text: "Needs review", warning: true };
    case "Removed":
      return { custom: cell.hasOverride, text: "No longer in the application", warning: true };
    case "Overridden":
      return { custom: true, text: null, warning: false };
    default:
      return { custom: false, text: null, warning: false };
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
