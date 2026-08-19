import { keepPreviousData, useInfiniteQuery, useQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "../../api/generated/client.js";
import type { MessageKey, MessageKeyList } from "../../api/generated/models.js";
import type { EditorFilters } from "../state/filters.js";
import { queryKeys } from "./keys.js";
import { flattenKeys, nextPageParam, totalOf } from "./cache.js";

/** One page at a time, appended as the grid scrolls. */
export const PAGE_SIZE = 100;

/**
 * Offset paging under an infinite query relies on the order holding still between page fetches.
 * Every sort ends in a (namespace, key) tiebreaker, so the order is deterministic for a given set of
 * rows; what can move a row is a source sync inserting keys, or -- when sorting by status or by when
 * a translation was last edited -- saving an override. Both invalidate this query, which refetches
 * the loaded pages together rather than leaving a stale offset behind.
 */
export interface KeyRows {
  keys: MessageKey[];
  total: number;
  query: UseInfiniteQueryResult<{ pages: MessageKeyList[] }, Error>;
}

export const useKeyRows = (filters: EditorFilters): KeyRows => {
  const query = useInfiniteQuery({
    queryKey: queryKeys.keyList(filters),
    queryFn: ({ pageParam, signal }) =>
      api.messageKeys({
        locale: filters.locale ?? undefined,
        referenceLocale: filters.referenceLocale ?? undefined,
        compare: [...filters.compare],
        namespace: filters.namespace ?? undefined,
        keyPrefix: filters.keyPrefix ?? undefined,
        query: filters.query || undefined,
        status: filters.status,
        sort: sortOf(filters.sort),
        direction: filters.direction === "desc" ? "Descending" : "Ascending",
        page: pageParam,
        pageSize: PAGE_SIZE,
      }, signal),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
    // Keeps the previous filter's rows on screen while the next query runs, so changing a filter
    // does not blank the grid.
    placeholderData: keepPreviousData,
    // Deliberately no `maxPages`. The grid sizes its scrollbar to the total and treats list index N
    // as `keys[N]`, which holds only while the loaded pages stay contiguous from the first. Evicting
    // page 1 to cap memory would slide every later row into the wrong slot.
  });

  const keys = useMemo(() => flattenKeys(query.data), [query.data]);
  return { keys, total: totalOf(query.data), query: query as KeyRows["query"] };
};

/**
 * One key, in every language there is.
 *
 * The list shows two languages because a list is for scanning and a third column is too narrow to
 * hold a sentence. The question the list therefore cannot answer -- is this wrong everywhere, or
 * only here -- is the one an editor asks most often once they have found the row, so the pane
 * fetches the rest.
 *
 * A separate query rather than widening the list's own: asking for every language on every row of
 * a thousand-row page would pay for the whole grid to answer a question about one cell of it. The
 * key is addressed by its prefix, which matches that node of the key tree and everything beneath
 * it, so the exact row is picked back out here.
 *
 * The two locales that define the key set are the same pair the list used, deliberately. The server
 * builds the set of keys from those two alone -- a compare locale adds a column but must not drag
 * in keys neither of them has -- so any other pair could exclude the very key being asked about.
 */
export const useKeyLocales = (
  target: { sourceId: string; namespace: string; key: string } | undefined,
  keySet: { locale: string; referenceLocale: string } | undefined,
  locales: readonly string[],
  enabled: boolean,
) =>
  useQuery({
    queryKey: queryKeys.keyLocales(
      target?.sourceId ?? "",
      target?.namespace ?? "",
      target?.key ?? "",
      `${keySet?.locale ?? ""}|${keySet?.referenceLocale ?? ""}`,
    ),
    enabled: enabled && target !== undefined && keySet !== undefined && locales.length > 0,
    queryFn: async ({ signal }) => {
      const page = await api.messageKeys({
        sourceId: target!.sourceId,
        namespace: target!.namespace,
        keyPrefix: target!.key,
        locale: keySet!.locale,
        referenceLocale: keySet!.referenceLocale,
        compare: locales.filter((code) => code !== keySet!.locale && code !== keySet!.referenceLocale),
        pageSize: KEY_TREE_PAGE_SIZE,
      }, signal);
      return page.items.find((item) => item.key === target!.key) ?? null;
    },
  });

/**
 * A prefix names a node and everything under it, so a key with children brings them along. Enough
 * to find the key itself among them without paging, and small enough that a deep node costs little.
 */
const KEY_TREE_PAGE_SIZE = 50;

export const useFacets = () =>
  useQuery({
    queryKey: queryKeys.facets(),
    queryFn: ({ signal }) => api.facets(signal),
    staleTime: 60_000,
  });

export const usePermissions = () =>
  useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: ({ signal }) => api.permissions(signal),
    // Permissions change with the user, and the entry point clears the cache when auth changes.
    staleTime: Infinity,
  });

/**
 * Sources double as the sync indicator. Polling only runs while a sync is in flight, and
 * react-query does not poll a hidden tab, so an idle editor makes no requests at all.
 */
export const useSyncStatus = () =>
  useQuery({
    queryKey: queryKeys.sources(),
    queryFn: ({ signal }) => api.sources(signal),
    refetchInterval: (query) =>
      query.state.data?.some((source) => source.syncInProgress) ? 4_000 : false,
  });

const sortOf = (sort: EditorFilters["sort"]) =>
  sort === "updatedAt" ? "UpdatedAt" as const : sort === "status" ? "Status" as const : "Key" as const;
