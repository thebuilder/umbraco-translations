import { createContext, type ReactNode, use } from "react";
import { type Draft, type DraftStore, useDraft } from "../state/drafts.js";
import { type EditTarget, targetId } from "../state/target.js";

/**
 * Unsaved translations as the list shows them: the text on the row it belongs to, and a way to save
 * it or throw it away from there.
 *
 * Provided rather than passed to the columns, because the columns are built once per view and a
 * save starting or ending is not a reason to rebuild every cell.
 */
export interface Unsaved {
  canEdit: boolean;
  drafts: DraftStore;
  save: (draft: Draft) => void;
  saving: boolean;
}

export const UnsavedContext = createContext<Unsaved | null>(null);

const useRowDraft = (target: EditTarget | undefined) => {
  const unsaved = use(UnsavedContext);
  // A store with nothing in it when there is no context, so the hook is always called.
  const text = useDraft(unsaved?.drafts ?? emptyStore, target ? targetId(target) : "");
  return unsaved && target && text !== undefined ? { unsaved, text } : null;
};

const emptyStore: DraftStore = {
  get: () => undefined,
  has: () => false,
  all: () => [],
  set: () => undefined,
  subscribe: () => () => undefined,
};

/** The row's text when it has unsaved text: that, rather than what is saved, is what is in hand. */
export const UnsavedValue = ({
  target,
  children,
}: {
  target: EditTarget | undefined;
  /** What the row shows without unsaved text. */
  children: ReactNode;
}) => {
  const draft = useRowDraft(target);
  if (!draft) {
    return children;
  }
  return draft.text === "" ? (
    <span className="row__value row__value--absent row__value--unsaved">Emptied</span>
  ) : (
    <span className="row__value row__value--unsaved" title={draft.text}>
      {draft.text}
    </span>
  );
};

/**
 * Saving or throwing away a row's unsaved text without opening it again. Each button stops its
 * click, so pressing it does not also open the row it sits on.
 */
export const UnsavedActions = ({
  target,
  children,
}: {
  target: EditTarget | undefined;
  /** What the row shows without unsaved text. */
  children: ReactNode;
}) => {
  const draft = useRowDraft(target);
  if (!(draft && target)) {
    return children;
  }
  const { unsaved, text } = draft;
  return (
    <span className="row__unsaved">
      <button
        className="button button--quiet button--small"
        disabled={unsaved.saving}
        onClick={(event) => {
          event.stopPropagation();
          unsaved.drafts.set(target, undefined);
        }}
        title="Throw the unsaved text away"
        type="button"
      >
        Discard
      </button>
      {/* Last, where the eye ends up on a row. An emptied field is not offered it: blank on the
          site, or back to the default, is a decision for the editor rather than for a row. */}
      {text === "" || !unsaved.canEdit ? null : (
        <button
          className="button button--soft button--small"
          disabled={unsaved.saving}
          onClick={(event) => {
            event.stopPropagation();
            const entry = unsaved.drafts.all().find((d) => targetId(d.target) === targetId(target));
            if (entry) {
              unsaved.save(entry);
            }
          }}
          type="button"
        >
          Save
        </button>
      )}
    </span>
  );
};
