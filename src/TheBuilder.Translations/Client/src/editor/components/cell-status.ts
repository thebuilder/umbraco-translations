import type { MessageCell, MessageLocaleState } from "../../api/generated/models.js";

export interface CellStatus {
  /** Custom text has been written here. A word in a quiet voice, never a badge. */
  custom: boolean;
  /** Which of the two deciding states it is, so they can be told apart by colour as well as words. */
  state: MessageLocaleState | null;
  /** Said with real presence only when the editor has to decide something about it. */
  text: string | null;
  warning: boolean;
}

/**
 * What to say beside a translation, and when to say nothing.
 *
 * The two are different questions. "This has custom text" is true of a great many rows, so it gets
 * a word in the quietest voice on the row -- spelling it out loudly under each one is a label
 * repeated down the whole column that buries the rows that actually need attention. "The
 * application text changed underneath this" is rare and asks the editor to do something, so it gets
 * a badge with its own colour, which is the one thing on the row that should catch an eye scanning
 * past it.
 *
 * The wording is the editor's, not the schema's. "Needs review" describes a workflow nobody here
 * has; "App text changed" describes what happened.
 */
export const cellStatus = (cell: MessageCell | undefined): CellStatus => {
  // Nothing to mark: the value itself renders as "Not written", which already says it.
  if (!cell) {
    return { custom: false, text: null, warning: false, state: null };
  }

  switch (cell.state) {
    case "NeedsReview":
      return {
        custom: cell.hasOverride,
        text: "App text changed",
        warning: true,
        state: "NeedsReview",
      };
    case "Removed":
      return { custom: cell.hasOverride, text: "Gone from app", warning: true, state: "Removed" };
    case "Overridden":
      return { custom: true, text: null, warning: false, state: "Overridden" };
    default:
      return { custom: false, text: null, warning: false, state: "Default" };
  }
};

/** Counts for the summary line, so an editor can see the shape of the work before scrolling. */
export const summarise = (
  cells: readonly (MessageCell | undefined)[]
): { customised: number; needsReview: number; missing: number } => ({
  customised: cells.filter((cell) => cell?.hasOverride && cell.state !== "Removed").length,
  needsReview: cells.filter((cell) => cell?.state === "NeedsReview").length,
  missing: cells.filter((cell) => cell === undefined).length,
});
