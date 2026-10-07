import { useCallback, useMemo, useRef } from "react";
import type { LocaleFacet } from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import {
  useAssistantStatus,
  useFacets,
  useKeyRows,
  usePermissions,
  useSyncStatus,
} from "../api/queries.js";
import { KeyGrid } from "../components/key-grid.js";
import { ListState } from "../components/list-state.js";
import { TranslationDetail } from "../components/translation-detail.js";
import { UnsavedContext } from "../components/unsaved.js";
import { matchedElsewhere } from "../search/matched-in.js";
import { useSearchShortcut } from "../search/use-search-shortcut.js";
import { editingMode } from "../state/editing-mode.js";
import type { EditorFilters } from "../state/filters.js";
import { clearedFilters, describeListState, hasNarrowingFilters } from "../state/list-state.js";
import { defaultLocale, facetFor, localeName } from "../state/locales.js";
import { targetId } from "../state/target.js";
import { useUrlFilters } from "../state/use-url-filters.js";
import { ContextStrip } from "./context-strip.js";
import { Filters } from "./filter-bar.js";
import { ResultsHead } from "./results-head.js";
import { SearchField } from "./search-field.js";
import { useEditorSelection } from "./use-editor-selection.js";
import { useUnsaved } from "./use-unsaved.js";

/**
 * The filters as the screen actually reads them.
 *
 * The server resolves the pair when the URL names neither and reports what it chose, so the strip
 * reflects that decision rather than duplicating the rules.
 *
 * Empty rather than absent is how it answers before anything has synced, and an empty string is not
 * a language. `??` kept it, so the strip worked from a code that names no facet. It read "Choose a
 * language" beside a menu already sitting on the only entry it had, and picking that entry changed
 * nothing. `||` treats it as the nothing it is, and the site's own default stands in until the
 * server has something to say.
 */
const shownFilters = (
  filters: EditorFilters,
  page: { targetLocale?: string; referenceLocale?: string | null } | undefined,
  locales: readonly LocaleFacet[]
): EditorFilters => ({
  ...filters,
  locale: filters.locale || page?.targetLocale || defaultLocale(locales),
  // No fallback for the comparison. With nothing synced there is nothing to read this language
  // against, and "None" is honest where a language picked to fill the slot is not.
  referenceLocale: filters.referenceLocale || page?.referenceLocale || null,
});

export const EditorApp = ({ bridge }: { bridge: BackofficeBridge }) => {
  const [filters, update] = useUrlFilters();
  const search = useRef<HTMLInputElement>(null);
  useSearchShortcut(
    useCallback(() => {
      search.current?.focus();
      search.current?.select();
    }, [])
  );

  const facets = useFacets();
  const permissions = usePermissions();
  // Defaults to withheld rather than granted: until the answer arrives, offering a field that
  // cannot be saved is the more expensive of the two mistakes to make.
  const canEdit = permissions.data?.canEdit ?? false;
  const assistant = useAssistantStatus(canEdit);
  const sync = useSyncStatus();
  const rows = useKeyRows(filters);

  const locales = facets.data?.locales ?? [];
  const shown = shownFilters(filters, rows.query.data?.pages[0], locales);

  const current = facetFor(locales, shown.locale);
  const mode = editingMode(current);
  const comparing = shown.referenceLocale !== null && shown.referenceLocale !== shown.locale;
  const referenceName = localeName(locales, shown.referenceLocale);

  const { selected, open, select, drafts } = useEditorSelection({
    locale: shown.locale,
    referenceLocale: shown.referenceLocale,
    update,
    keys: rows.keys,
    progress: {
      isSuccess: rows.query.isSuccess,
      isFetching: rows.query.isFetching,
      isPlaceholderData: rows.query.isPlaceholderData,
      hasNextPage: rows.query.hasNextPage,
    },
    onKept: (kept) =>
      bridge.notify(
        "warning",
        "Your unsaved text was kept",
        `${kept.namespace}.${kept.key} is no longer in the list. Open it again to carry on.`
      ),
  });

  /*
   * Rows that are results on the strength of a language neither column shows. Search is
   * locale-blind, so pasting in an English sentence while editing Danish finds the key -- but
   * without saying how many rows came back that way, the list reads as though it ignored what was
   * typed. Counted over the rows in hand rather than the whole result, because that is all anyone
   * can scroll to; the grid keeps pulling pages until the two agree.
   */
  const elsewhere = useMemo(
    () =>
      rows.keys.filter(
        (key) =>
          matchedElsewhere(key, shown.query, [shown.locale, shown.referenceLocale]).length > 0
      ).length,
    // Memoised because the whole loaded result is scanned and a keystroke in the search field
    // re-renders this component: the filter state is set synchronously and only the history write
    // is debounced, so without this a ten-character search walks a thousand-row list ten times.
    [rows.keys, shown.query, shown.locale, shown.referenceLocale]
  );

  const unsaved = useUnsaved(drafts, bridge, canEdit);

  const listState = describeListState({
    error: rows.query.error ?? undefined,
    loading: rows.query.isLoading,
    rowCount: rows.keys.length,
    totalKeys: facets.data?.totalKeys,
  });
  const syncing = sync.data?.some((source) => source.syncInProgress) ?? false;

  return (
    <main className="shell">
      <header className="toolbar">
        <SearchField query={shown.query} searchRef={search} update={update} />
        <ContextStrip filters={shown} locales={locales} mode={mode} update={update} />
      </header>

      <UnsavedContext value={unsaved.context}>
        <div className="board">
          <div className="bar">
            <ResultsHead
              current={current}
              elsewhere={elsewhere}
              filters={shown}
              mode={mode}
              syncing={syncing}
              total={listState.kind === "rows" ? rows.total : 0}
              totalKeys={facets.data?.totalKeys}
              unsaved={unsaved.summary}
              update={update}
              viewOnly={permissions.data !== undefined && !permissions.data.canEdit}
            />
            <Filters filters={shown} namespaces={facets.data?.namespaces ?? []} update={update} />
          </div>

          {listState.kind === "rows" ? (
            <KeyGrid
              editor={(row) =>
                open ? (
                  <TranslationDetail
                    assistant={canEdit && assistant.data === true}
                    bridge={bridge}
                    canEdit={canEdit}
                    key={targetId(open.target)}
                    locales={locales}
                    open={open}
                    reference={
                      comparing && shown.referenceLocale
                        ? { locale: shown.referenceLocale, name: referenceName }
                        : undefined
                    }
                    row={row}
                  />
                ) : null
              }
              filters={shown}
              hasMore={rows.query.hasNextPage}
              keys={rows.keys}
              loadingMore={rows.query.isFetchingNextPage}
              locales={locales}
              namespaceCount={facets.data?.namespaces.length ?? 0}
              onLoadMore={() => {
                rows.query.fetchNextPage();
              }}
              onSelect={select}
              selected={selected}
              total={rows.total}
            />
          ) : (
            <ListState
              canManageSources={permissions.data?.canManageSources ?? false}
              filtered={hasNarrowingFilters(shown)}
              onClear={() => update(clearedFilters())}
              onRetry={() => {
                rows.query.refetch();
              }}
              state={listState}
              term={shown.query}
            />
          )}
        </div>
      </UnsavedContext>
    </main>
  );
};
