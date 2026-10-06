import type { MessageCell, MessageDetail } from "../../api/generated/models.js";
import { type DraftStore, useDraft } from "../state/drafts.js";
import { type EditTarget, targetId } from "../state/target.js";
import { describeOverride } from "../validation/override.js";

/**
 * What the footer says before anything is pressed. An override the server has never been given is
 * absent rather than empty, and it arrives as either `null` or `undefined` depending on which
 * endpoint answered, so both mean "nothing written here yet".
 */
export const describeDraftState = (
  dirty: boolean,
  saved: Pick<MessageCell, "overrideValue" | "defaultValue"> | undefined
): string => {
  if (dirty) {
    return "Unsaved changes";
  }
  if (saved?.overrideValue !== null && saved?.overrideValue !== undefined) {
    return "Your text is saved";
  }
  // The field starts from the default text, so where there is some, that is what it holds.
  return saved?.defaultValue ? "Default text" : "Nothing written here yet";
};

/**
 * The text being typed, measured against what is saved and against the server's rule.
 *
 * Kept in the draft store rather than here, so it survives this editor unmounting, and only while
 * it differs from what is saved: typing back to the saved text forgets it, which is what makes
 * "is there unsaved text" the same question as "is there an entry".
 */
export const useMessageDraft = (
  drafts: DraftStore,
  target: EditTarget,
  message: MessageDetail | undefined
) => {
  const id = targetId(target);
  const draft = useDraft(drafts, id);
  /*
   * The field starts from the text the site serves now: the editor's own, or the default where
   * there is none. Correcting a typo is editing the sentence that has it, and an empty box beside
   * it asked for the whole thing to be retyped.
   */
  const committed = message?.overrideValue ?? message?.defaultValue ?? "";
  const value = draft ?? committed;
  const dirty = draft !== undefined && draft !== committed;
  // Emptying the default text is not a translation. Saved, it would blank the string on the site
  // rather than leave it alone, which is never what clearing the field to start again meant.
  const blanking = value === "" && message?.overrideValue === null;

  const setDraft = (text: string | undefined) =>
    drafts.set(target, text === committed ? undefined : text, message?.version ?? null);

  /**
   * The same rule the server applies, checked as the editor types so a mistake is answered beside
   * the field instead of by a failed save. Blank is exempt: an empty draft means "go back to the
   * default text", which is a reset rather than a translation missing its placeholders.
   */
  const problem = message && value !== "" ? describeOverride(value, message) : null;

  return { draft, setDraft, value, dirty, blanking, problem };
};
