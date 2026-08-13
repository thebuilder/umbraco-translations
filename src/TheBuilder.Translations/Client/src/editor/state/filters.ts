import type { MessageStatus } from "../../api/generated/models.js";

/**
 * The editor's filter state, normalised. Every field is present and uses `null` rather than
 * `undefined` for "not set", because react-query hashes the key object: `undefined`, `null` and `""`
 * would otherwise be three different cache entries for the same query.
 *
 * `page` is deliberately absent. The list is an infinite query, so the page number is the cursor,
 * not part of the identity of the query.
 */
export interface EditorFilters {
  locale: string | null;
  referenceLocale: string | null;
  compare: readonly string[];
  namespace: string | null;
  keyPrefix: string | null;
  query: string;
  status: MessageStatus;
  sort: SortField;
  direction: SortDirection;
}

export type SortField = "key" | "updatedAt" | "status";
export type SortDirection = "asc" | "desc";

const STATUSES: readonly MessageStatus[] = ["All", "Default", "Overridden", "NeedsReview", "Missing"];
const SORT_FIELDS: readonly SortField[] = ["key", "updatedAt", "status"];
const DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];

export const defaultFilters: EditorFilters = {
  locale: null,
  referenceLocale: null,
  compare: [],
  namespace: null,
  keyPrefix: null,
  query: "",
  status: "All",
  sort: "key",
  direction: "asc",
};

const oneOf = <T extends string>(allowed: readonly T[], value: string | null, fallback: T): T =>
  allowed.find((candidate) => candidate === value) ?? fallback;

const trimmedOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Collapses equivalent filter objects onto one representation so they hash to the same query key.
 * `compare` is sorted and de-duplicated, and never contains the target or reference locale, which
 * would otherwise request the same column twice.
 */
export const normalizeFilters = (filters: Partial<EditorFilters>): EditorFilters => {
  const locale = trimmedOrNull(filters.locale);
  const referenceLocale = trimmedOrNull(filters.referenceLocale);
  const shown = new Set([locale, referenceLocale].filter((value): value is string => value !== null));
  const compare = [
    ...new Set((filters.compare ?? []).map((value) => value.trim()).filter((value) => value.length > 0)),
  ]
    .filter((value) => !shown.has(value))
    .sort();

  return {
    locale,
    referenceLocale,
    compare,
    namespace: trimmedOrNull(filters.namespace),
    // A key prefix is a dotted path; a trailing dot is how a user types it but not how it is stored.
    keyPrefix: trimmedOrNull(filters.keyPrefix)?.replace(/\.+$/, "") || null,
    query: filters.query?.trim() ?? "",
    status: oneOf(STATUSES, filters.status ?? null, "All"),
    sort: oneOf(SORT_FIELDS, filters.sort ?? null, "key"),
    direction: oneOf(DIRECTIONS, filters.direction ?? null, "asc"),
  };
};

export const parseFilters = (search: string): EditorFilters => {
  const params = new URLSearchParams(search);
  return normalizeFilters({
    locale: params.get("locale"),
    referenceLocale: params.get("reference"),
    compare: params.get("compare")?.split(",") ?? [],
    namespace: params.get("namespace"),
    keyPrefix: params.get("prefix"),
    query: params.get("q") ?? "",
    status: (params.get("status") ?? undefined) as MessageStatus | undefined,
    sort: (params.get("sort") ?? undefined) as SortField | undefined,
    direction: (params.get("dir") ?? undefined) as SortDirection | undefined,
  });
};

/** Only non-default values are written, so a pristine editor has a clean URL. */
export const serializeFilters = (filters: EditorFilters): string => {
  const params = new URLSearchParams();
  const set = (key: string, value: string | null) => {
    if (value) params.set(key, value);
  };

  set("locale", filters.locale);
  set("reference", filters.referenceLocale);
  set("compare", filters.compare.length > 0 ? filters.compare.join(",") : null);
  set("namespace", filters.namespace);
  set("prefix", filters.keyPrefix);
  set("q", filters.query || null);
  set("status", filters.status === defaultFilters.status ? null : filters.status);
  set("sort", filters.sort === defaultFilters.sort ? null : filters.sort);
  set("dir", filters.direction === defaultFilters.direction ? null : filters.direction);

  return params.size > 0 ? `?${params}` : "";
};

/** True when a change should push a history entry rather than replace one. */
export const isNavigationalChange = (before: EditorFilters, after: EditorFilters): boolean =>
  before.locale !== after.locale ||
  before.referenceLocale !== after.referenceLocale ||
  before.namespace !== after.namespace ||
  before.keyPrefix !== after.keyPrefix ||
  before.status !== after.status;
