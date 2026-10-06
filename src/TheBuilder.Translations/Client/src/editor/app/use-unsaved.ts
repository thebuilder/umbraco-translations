import { useEffect, useMemo } from "react";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { useSaveDrafts } from "../api/save-drafts.js";
import type { Unsaved } from "../components/unsaved.js";
import { type DraftStore, useDrafts } from "../state/drafts.js";

/** What the results bar says about unsaved text, and its way to save all of it. */
export interface UnsavedSummary {
  count: number;
  /** Absent when there is nothing it could save, or nobody here may. */
  saveAll?: () => void;
  saving: boolean;
}

/**
 * Unsaved text across the list: what the rows need to show and save it, and what the results bar
 * needs to count and save all of it.
 */
export const useUnsaved = (
  drafts: DraftStore,
  bridge: BackofficeBridge,
  canEdit: boolean
): { context: Unsaved; summary: UnsavedSummary } => {
  const all = useDrafts(drafts);
  const save = useSaveDrafts(drafts, bridge);
  const { mutate, isPending } = save;

  /*
   * Session storage keeps the text across a reload and a trip to another section, but not past the
   * tab closing. That is the one way to lose it without being told, so the browser is asked to say.
   */
  const any = all.length > 0;
  useEffect(() => {
    if (!any) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [any]);

  const context = useMemo(
    (): Unsaved => ({ drafts, save: (draft) => mutate([draft]), saving: isPending, canEdit }),
    [drafts, mutate, isPending, canEdit]
  );

  // An emptied field is left out: whether it means blank on the site or back to the default is
  // decided in the editor, not in bulk.
  const savable = all.filter((draft) => draft.text !== "");
  return {
    context,
    summary: {
      count: all.length,
      saveAll: canEdit && savable.length > 0 ? () => mutate(savable) : undefined,
      saving: isPending,
    },
  };
};
