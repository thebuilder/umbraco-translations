import { useCallback, useRef, useState } from "react";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { useFacets, useKeyRows, usePermissions, useSyncStatus } from "../api/queries.js";
import { KeyGrid } from "../components/KeyGrid.js";
import { ListState } from "../components/ListState.js";
import { TranslationDetail } from "../components/TranslationDetail.js";
import { useSearchShortcut } from "../search/use-search-shortcut.js";
import { clearedFilters, describeListState, hasNarrowingFilters } from "../state/list-state.js";
import { useUrlFilters } from "../state/use-url-filters.js";
import { Toolbar } from "./Toolbar.js";

export const EditorApp = ({ bridge }: { bridge: BackofficeBridge }) => {
  const [filters, update] = useUrlFilters();
  const [selectedId, setSelectedId] = useState<string>();

  /**
   * Typed text that has not been saved lives only in the drawer, so anything that would unmount it
   * has to ask first. A ref rather than state: this changes on every keystroke and re-rendering the
   * whole editor for it would be absurd, and nothing on screen depends on the value.
   */
  const unsaved = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => { unsaved.current = dirty; }, []);
  const mayLeave = () =>
    !unsaved.current || confirm("This translation has changes you have not saved. Discard them?");

  // Both routes out of an open translation: picking another row, and closing altogether.
  const select = useCallback((messageId: string) => {
    if (messageId === selectedId || mayLeave()) setSelectedId(messageId);
  }, [selectedId]);
  const close = useCallback(() => {
    if (mayLeave()) setSelectedId(undefined);
  }, []);

  const search = useRef<HTMLInputElement>(null);
  useSearchShortcut(useCallback(() => {
    search.current?.focus();
    search.current?.select();
  }, []));

  const facets = useFacets();
  const permissions = usePermissions();
  // Defaults to withheld rather than granted: until the answer arrives, offering a field that
  // cannot be saved is the more expensive of the two mistakes to make.
  const canEdit = permissions.data?.canEdit ?? false;
  const sync = useSyncStatus();
  const rows = useKeyRows(filters);

  const locales = facets.data?.locales ?? [];
  // The server resolves the pair when the URL names neither and reports what it chose, so the
  // toolbar reflects that decision rather than duplicating the rules.
  const page = rows.query.data?.pages[0];
  const shown: typeof filters = {
    ...filters,
    locale: filters.locale ?? page?.targetLocale ?? null,
    referenceLocale: filters.referenceLocale ?? page?.referenceLocale ?? null,
  };
  const listState = describeListState({
    error: rows.query.error ?? undefined,
    loading: rows.query.isLoading,
    rowCount: rows.keys.length,
    totalKeys: facets.data?.totalKeys,
  });

  const current = locales.find((locale) => locale.code === shown.locale);
  const syncing = sync.data?.some((source) => source.syncInProgress) ?? false;

  // Which row an open translation is, so the drawer can offer the one after it and show the
  // comparison text the list already holds rather than fetching it a second time.
  const rowOf = (messageId: string) =>
    rows.keys.findIndex((key) => shown.locale !== null && key.cells[shown.locale]?.id === messageId);

  const rowAfter = (messageId: string): string | undefined => {
    const index = rowOf(messageId);
    const following = index < 0 ? undefined : rows.keys[index + 1];
    return shown.locale !== null && following ? following.cells[shown.locale]?.id : undefined;
  };

  const comparisonFor = (messageId: string) => {
    const reference = shown.referenceLocale;
    if (reference === null || reference === shown.locale) return undefined;
    const key = rows.keys[rowOf(messageId)];
    const cell = key?.cells[reference];
    return {
      locale: reference,
      name: locales.find((locale) => locale.code === reference)?.name || reference,
      value: cell ? cell.overrideValue ?? cell.defaultValue : null,
    };
  };

  return (
    <main className="shell">
      <Toolbar
        filters={shown}
        locales={locales}
        namespaces={facets.data?.namespaces ?? []}
        update={update}
        searchRef={search}
      />

      <div className="board">
        {listState.kind === "rows" ? (
          <KeyGrid
            keys={rows.keys}
            filters={shown}
            total={rows.total}
            locales={locales}
            namespaceCount={facets.data?.namespaces.length ?? 0}
            selectedId={selectedId}
            onSelect={select}
            onLoadMore={() => void rows.query.fetchNextPage()}
            hasMore={rows.query.hasNextPage}
            loadingMore={rows.query.isFetchingNextPage}
          />
        ) : (
          <ListState
            state={listState}
            term={shown.query}
            filtered={hasNarrowingFilters(shown)}
            canManageSources={permissions.data?.canManageSources ?? false}
            onClear={() => update(clearedFilters())}
            onRetry={() => void rows.query.refetch()}
          />
        )}

        <div className="board__bar">
          <span><strong>{rows.total.toLocaleString()}</strong> translations</span>
          {current && current.absentKeyCount > 0 && (
            <><span className="board__sep" />{current.absentKeyCount.toLocaleString()} not translated</>
          )}
          {current && current.needsReviewCount > 0 && (
            <>
              <span className="board__sep" />
              <span className="status--warning">{current.needsReviewCount.toLocaleString()} need review</span>
            </>
          )}
          <span className="board__spacer" />
          {syncing && <span role="status">Synchronising…</span>}
          {permissions.data && !permissions.data.canEdit && <span>View-only access</span>}
        </div>

        {selectedId && (
          <TranslationDetail
            key={selectedId}
            id={selectedId}
            bridge={bridge}
            comparison={comparisonFor(selectedId)}
            next={rowAfter(selectedId)}
            canEdit={canEdit}
            onDirtyChange={onDirtyChange}
            select={select}
            close={close}
          />
        )}
      </div>
    </main>
  );
};
