import { useCallback, useMemo, useRef } from "react";
import type { LocaleFacet, MessageKey } from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { useFacets, useKeyRows, usePermissions, useSyncStatus } from "../api/queries.js";
import { KeyGrid } from "../components/key-grid.js";
import { ListState } from "../components/list-state.js";
import { TranslationDetail } from "../components/translation-detail.js";
import { matchedElsewhere } from "../search/matched-in.js";
import { useSearchShortcut } from "../search/use-search-shortcut.js";
import type { EditingMode } from "../state/editing-mode.js";
import { editingMode } from "../state/editing-mode.js";
import { defaultFilters, type EditorFilters } from "../state/filters.js";
import { clearedFilters, describeListState, hasNarrowingFilters } from "../state/list-state.js";
import { defaultLocale, facetFor, localeName } from "../state/locales.js";
import { type EditTarget, sameTarget, targetId, targetOf } from "../state/target.js";
import { useUrlFilters } from "../state/use-url-filters.js";
import { ContextStrip } from "./context-strip.js";
import { FilterBar } from "./filter-bar.js";
import { ResultsFoot } from "./results-foot.js";
import { ResultsHead } from "./results-head.js";
import { useEditorSelection } from "./use-editor-selection.js";

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

/**
 * A queue in the order the application defines its keys, which is the order it is meant to be
 * worked in and the only one that makes "the next one" mean anything.
 *
 * True only when nothing else is deciding the order or the contents: a search or another sort is
 * named in the bar above, and this one is the absence of anything there to read.
 */
const isQueue = (mode: EditingMode, filters: EditorFilters) =>
  mode === "queue" &&
  filters.query === "" &&
  filters.sort === defaultFilters.sort &&
  filters.direction === defaultFilters.direction;

/**
 * Where an open translation sits in the result, and the rows either side of it, so the pane can
 * offer them and say how much of a queue is left.
 *
 * Looked up by identity rather than remembered as a position, because the row moves underneath:
 * saving while sorted by what needs attention reorders the list while the pane is still open on the
 * row that moved.
 */
const neighbours = (keys: readonly MessageKey[], selected: EditTarget | undefined) => {
  const index = selected
    ? keys.findIndex((key) => sameTarget(targetOf(key, selected.locale), selected))
    : -1;
  if (!selected || index < 0) {
    return { index, row: undefined, previous: undefined, next: undefined };
  }
  const at = (offset: number) => {
    const neighbour = keys[index + offset];
    return neighbour ? targetOf(neighbour, selected.locale) : undefined;
  };
  return { index, row: keys[index], previous: at(-1), next: at(1) };
};

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
  const sync = useSyncStatus();
  const rows = useKeyRows(filters);

  const locales = facets.data?.locales ?? [];
  const shown = shownFilters(filters, rows.query.data?.pages[0], locales);

  const current = facetFor(locales, shown.locale);
  const mode = editingMode(current);
  const comparing = shown.referenceLocale !== null && shown.referenceLocale !== shown.locale;
  const referenceName = localeName(locales, shown.referenceLocale);

  const { selected, pending, onDirtyChange, select, close, discard, keepEditing } =
    useEditorSelection({
      locale: shown.locale,
      referenceLocale: shown.referenceLocale,
      update,
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

  const queued = isQueue(mode, shown);

  const listState = describeListState({
    error: rows.query.error ?? undefined,
    loading: rows.query.isLoading,
    rowCount: rows.keys.length,
    totalKeys: facets.data?.totalKeys,
  });
  const syncing = sync.data?.some((source) => source.syncInProgress) ?? false;

  const { index, row, previous, next } = neighbours(rows.keys, selected);

  return (
    <main className="shell">
      <ContextStrip
        filters={shown}
        locales={locales}
        mode={mode}
        totalKeys={facets.data?.totalKeys}
        update={update}
      />

      <FilterBar
        filters={shown}
        namespaces={facets.data?.namespaces ?? []}
        searchRef={search}
        update={update}
      />

      <div className="board">
        <div className="results">
          {listState.kind === "rows" ? (
            <ResultsHead
              current={current}
              elsewhere={elsewhere}
              filters={shown}
              mode={mode}
              onShowAbsent={() => update({ status: "Absent" })}
              queued={queued}
              total={rows.total}
            />
          ) : null}

          {listState.kind === "rows" ? (
            <KeyGrid
              filters={shown}
              hasMore={rows.query.hasNextPage}
              keys={rows.keys}
              loadingMore={rows.query.isFetchingNextPage}
              locales={locales}
              mode={mode}
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

          <ResultsFoot
            current={current}
            editing={selected !== undefined && row !== undefined}
            namespace={shown.namespace}
            syncing={syncing}
            totalKeys={facets.data?.totalKeys ?? 0}
            viewOnly={permissions.data !== undefined && !permissions.data.canEdit}
          />
        </div>

        {selected && row && shown.locale ? (
          <TranslationDetail
            bridge={bridge}
            canEdit={canEdit}
            close={close}
            key={targetId(selected)}
            locales={locales}
            mode={mode}
            next={next}
            onDirtyChange={onDirtyChange}
            onDiscard={discard}
            onKeepEditing={keepEditing}
            pending={pending}
            position={{ index: index + 1, total: rows.total }}
            previous={previous}
            reference={
              comparing && shown.referenceLocale
                ? { locale: shown.referenceLocale, name: referenceName }
                : undefined
            }
            row={row}
            select={select}
            switchLocale={(locale) => select({ ...selected, locale })}
            target={selected}
            term={shown.query}
          />
        ) : null}
      </div>
    </main>
  );
};
