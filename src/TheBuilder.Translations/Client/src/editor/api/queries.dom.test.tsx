import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageKeyList } from "../../api/generated/models.js";
import { normalizeFilters } from "../state/filters.js";
import { PAGE_SIZE, useKeyRows, useSyncStatus } from "./queries.js";

const messageKeys = vi.fn();
const sources = vi.fn();

vi.mock("../../api/generated/client.js", () => ({
  api: {
    messageKeys: (...args: unknown[]) => messageKeys(...args),
    sources: (...args: unknown[]) => sources(...args),
  },
}));

const pageOf = (keys: string[], page: number, total: number): MessageKeyList => ({
  items: keys.map((key) => ({
    sourceId: "source-1",
    namespace: "website",
    key,
    format: "Icu",
    arguments: {},
    cells: {},
    coverage: {},
    matchedLocales: [],
  })),
  page,
  pageSize: PAGE_SIZE,
  total,
  referenceLocale: "en-US",
  targetLocale: "da-DK",
  compareLocales: [],
});

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  messageKeys.mockReset();
  sources.mockReset();
});
afterEach(cleanup);

describe("useKeyRows", () => {
  it("maps editor filters onto the endpoint's query", async () => {
    messageKeys.mockResolvedValue(pageOf(["cart.empty"], 1, 1));
    const filters = normalizeFilters({
      locale: "da-DK",
      referenceLocale: "en-US",
      compare: ["de-DE"],
      namespace: "website",
      keyPrefix: "cart",
      query: "empty",
      status: "Absent",
      sort: "updatedAt",
      direction: "desc",
    });

    const { result } = renderHook(() => useKeyRows(filters), { wrapper });
    await waitFor(() => expect(result.current.keys).toHaveLength(1));

    expect(messageKeys).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "da-DK",
        referenceLocale: "en-US",
        compare: ["de-DE"],
        namespace: "website",
        keyPrefix: "cart",
        query: "empty",
        status: "Absent",
        // The client's lowercase sort names are not the wire enum's.
        sort: "UpdatedAt",
        direction: "Descending",
        page: 1,
        pageSize: PAGE_SIZE,
      }),
      expect.anything(),
    );
  });

  it("omits empty filters rather than sending blank strings", async () => {
    messageKeys.mockResolvedValue(pageOf([], 1, 0));

    const { result } = renderHook(() => useKeyRows(normalizeFilters({})), { wrapper });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    const sent = messageKeys.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.namespace).toBeUndefined();
    expect(sent.query).toBeUndefined();
    expect(sent.keyPrefix).toBeUndefined();
  });

  it("appends the next page and reports the total across pages", async () => {
    messageKeys
      .mockResolvedValueOnce(pageOf(["a", "b"], 1, 3))
      .mockResolvedValueOnce(pageOf(["c"], 2, 3));

    const { result } = renderHook(() => useKeyRows(normalizeFilters({})), { wrapper });
    await waitFor(() => expect(result.current.keys).toHaveLength(2));

    expect(result.current.total).toBe(3);
    expect(result.current.query.hasNextPage).toBe(true);

    await result.current.query.fetchNextPage();
    await waitFor(() => expect(result.current.keys).toHaveLength(3));

    expect(result.current.keys.map((key) => key.key)).toEqual(["a", "b", "c"]);
    expect(result.current.query.hasNextPage).toBe(false);
  });

  it("stops asking for pages once everything matching is loaded", async () => {
    messageKeys.mockResolvedValue(pageOf(["only"], 1, 1));

    const { result } = renderHook(() => useKeyRows(normalizeFilters({})), { wrapper });
    await waitFor(() => expect(result.current.keys).toHaveLength(1));

    expect(result.current.query.hasNextPage).toBe(false);
  });

  it("refetches when a filter changes", async () => {
    messageKeys.mockResolvedValue(pageOf(["a"], 1, 1));
    const { rerender, result } = renderHook(
      ({ locale }: { locale: string }) => useKeyRows(normalizeFilters({ locale })),
      { wrapper, initialProps: { locale: "da-DK" } },
    );
    await waitFor(() => expect(result.current.keys).toHaveLength(1));

    rerender({ locale: "de-DE" });
    await waitFor(() => expect(messageKeys).toHaveBeenCalledTimes(2));

    expect((messageKeys.mock.calls[1]?.[0] as { locale: string }).locale).toBe("de-DE");
  });

  it("surfaces a failure instead of hanging", async () => {
    messageKeys.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useKeyRows(normalizeFilters({})), { wrapper });
    await waitFor(() => expect(result.current.query.isError).toBe(true));

    expect(result.current.keys).toEqual([]);
  });
});

describe("useSyncStatus", () => {
  it("does not poll while every source is idle", async () => {
    sources.mockResolvedValue([{ id: "s1", syncInProgress: false }]);

    const { result } = renderHook(() => useSyncStatus(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // An idle editor should make no requests at all; polling starts only once a sync is running.
    expect(sources).toHaveBeenCalledOnce();
  });

  it("polls while a sync is in flight", async () => {
    sources.mockResolvedValue([{ id: "s1", syncInProgress: true }]);

    const { result } = renderHook(() => useSyncStatus(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() => expect(sources.mock.calls.length).toBeGreaterThan(1), { timeout: 6_000 });
  });
});
