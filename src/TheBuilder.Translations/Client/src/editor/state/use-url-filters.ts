import { useCallback, useEffect, useRef, useState } from "react";
import {
  type EditorFilters,
  isNavigationalChange,
  normalizeFilters,
  parseFilters,
  serializeFilters,
} from "./filters.js";

/** Typing coalesces into one history entry rather than one per keystroke. */
const WRITE_DELAY_MS = 250;

/**
 * Keeps the editor's filters in the URL so a view can be linked to and the back button works.
 *
 * The backoffice router reads only `location.pathname`, so a query-only write cannot make it
 * re-navigate or unmount us. Writes still go through the patched `history` methods rather than the
 * originals stashed at `history.native`, because the originals would leave the router's own idea of
 * the current URL behind.
 */
export const useUrlFilters = (): [
  EditorFilters,
  (patch: Partial<EditorFilters>, navigation?: "auto" | "push" | "replace") => void,
] => {
  const [filters, setFilters] = useState(() => parseFilters(location.search));

  // Set while this hook is the one writing, so its own history entry does not read back as a
  // navigation and clobber a filter the user changed in the meantime.
  const writing = useRef(false);
  const pending = useRef<{ search: string; push: boolean } | null>(null);

  useEffect(() => {
    const onPopState = () => {
      if (writing.current) {
        return;
      }
      setFilters(parseFilters(location.search));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Writes are coalesced: a burst of keystrokes should leave one history entry, not one each.
  // biome-ignore lint/correctness/useExhaustiveDependencies: filters is the trigger, not a read. Every change restarts the timer, which is what coalesces the burst; the write itself comes from the ref, so it is whatever was pending when the timer fired.
  useEffect(() => {
    if (!pending.current) {
      return;
    }
    const timer = setTimeout(() => {
      const write = pending.current;
      pending.current = null;
      if (!write) {
        return;
      }

      writing.current = true;
      // The pathname is written back verbatim. Rebuilding it is how you end up fighting the router.
      const url = `${location.pathname}${write.search}`;
      if (write.push) {
        history.pushState(null, "", url);
      } else {
        history.replaceState(null, "", url);
      }
      writing.current = false;
    }, WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  const update = useCallback(
    (patch: Partial<EditorFilters>, navigation: "auto" | "push" | "replace" = "auto") => {
      setFilters((current) => {
        const next = normalizeFilters({ ...current, ...patch });
        const search = serializeFilters(next);
        if (search === serializeFilters(current)) {
          return current;
        }

        pending.current = {
          search,
          // Somewhere the editor expects to come back from is a history entry; refining a search is
          // not. "auto" asks the filter model which kind of change this was.
          push:
            navigation === "push" || (navigation === "auto" && isNavigationalChange(current, next)),
        };
        return next;
      });
    },
    []
  );

  return [filters, update];
};
