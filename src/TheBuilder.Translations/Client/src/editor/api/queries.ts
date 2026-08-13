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
  sort === "updatedAt" ? "UpdatedAt" as const : "Key" as const;
