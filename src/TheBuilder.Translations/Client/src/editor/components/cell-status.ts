import type { MessageCell } from "../../api/generated/models.js";

export interface CellStatus {
  /** A sentence under the value saying where the text comes from, or what is wrong with it. */
  text: string;
  /** True when it needs the editor to do something, rather than merely describing the state. */
  warning: boolean;
}

/**
 * What to say beneath a translation.
 *
 * A sentence rather than a chip. The states here are not severities to be colour-coded; they are
 * different facts about where a piece of text comes from, and "Using the application default" is
 * information an editor reads once and moves past, while "the default changed under your edit" is
 * a request to do something. Only the second earns emphasis.
 */
export const cellStatus = (cell: MessageCell | undefined, localeName: string): CellStatus => {
  if (!cell) {
    return { text: `Not provided by the application in ${localeName}`, warning: false };
  }

  switch (cell.state) {
    case "NeedsReview":
      return { text: "Application default changed. Review this custom text.", warning: true };
    case "Removed":
      return { text: "Removed from the application. Kept only because it has custom text.", warning: true };
    case "Overridden":
      return { text: `Custom text for ${localeName}`, warning: false };
    default:
      return { text: "Using the application default", warning: false };
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
