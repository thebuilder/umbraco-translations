import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/generated/client.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import type { Draft, DraftStore } from "../state/drafts.js";
import { fullKey, targetId } from "../state/target.js";
import { queryKeys } from "./keys.js";

/**
 * Saves unsaved translations that are not open: one from its row, or all of them at once.
 *
 * Each is its own save, as it would be from the editor, so they succeed or fail one by one. That
 * is what makes saving them together simple rather than a transaction nobody designed: a failure
 * is just a translation that is still unsaved, still marked on its row, with the reason said once.
 */
export const useSaveDrafts = (drafts: DraftStore, bridge: BackofficeBridge) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (batch: readonly Draft[]) => {
      const results = await Promise.allSettled(
        batch.map((draft) =>
          api.saveOverride({
            ...draft.target,
            value: draft.text,
            expectedVersion: draft.version ?? undefined,
          })
        )
      );
      return batch.map((draft, at) => ({ draft, result: results[at] }));
    },
    onSuccess: (outcomes) => {
      const failures: string[] = [];
      for (const { draft, result } of outcomes) {
        if (result?.status === "fulfilled") {
          // Forgotten only if it is still the text that was sent: anything typed while the save was
          // on its way is newer, and stays unsaved.
          if (drafts.get(targetId(draft.target)) === draft.text) {
            drafts.set(draft.target, undefined);
          }
          queryClient.setQueryData(queryKeys.message(result.value.id), result.value);
        } else {
          const reason = result?.reason instanceof Error ? result.reason.message : "";
          failures.push(`${fullKey(draft.target)}: ${reason}`);
        }
      }
      // Not awaited, as after any save: a failed refetch shows in the list's own error state.
      queryClient.invalidateQueries({ queryKey: queryKeys.keys() });
      queryClient.invalidateQueries({ queryKey: queryKeys.facets() });

      if (failures.length > 0) {
        bridge.notify(
          "danger",
          failures.length === 1
            ? "A translation could not be saved"
            : `${failures.length} translations could not be saved`,
          `${failures.join("\n")}\nThey are still unsaved; open one to fix it.`
        );
      }
    },
    onError: (error) => bridge.notify("danger", "Translations could not be saved", error.message),
  });
};
