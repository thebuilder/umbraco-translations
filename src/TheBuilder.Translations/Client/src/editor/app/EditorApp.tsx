import { useCallback, useMemo, useRef, useState } from "react";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { useFacets, useKeyRows, usePermissions, useSyncStatus } from "../api/queries.js";
import { KeyGrid } from "../components/KeyGrid.js";
import { ListState } from "../components/ListState.js";
import { Shortcuts } from "../components/Shortcuts.js";
import { TranslationDetail } from "../components/TranslationDetail.js";
import { matchedElsewhere } from "../search/matched-in.js";
import { useSearchShortcut } from "../search/use-search-shortcut.js";
import { editingMode } from "../state/editing-mode.js";
import { defaultFilters, editingLocale } from "../state/filters.js";
import { clearedFilters, describeListState, hasNarrowingFilters } from "../state/list-state.js";
import { defaultLocale, facetFor, localeName } from "../state/locales.js";
import { sameTarget, targetOf, targetId, type EditTarget } from "../state/target.js";
import { useUrlFilters } from "../state/use-url-filters.js";
import { ContextStrip } from "./ContextStrip.js";
import { FilterBar } from "./FilterBar.js";

export const EditorApp = ({ bridge }: { bridge: BackofficeBridge }) => {
  const [filters, update] = useUrlFilters();
  const [selected, setSelected] = useState<EditTarget>();

  /**
   * Typed text that has not been saved lives only in the pane, so anything that would unmount it
   * has to ask first. A ref rather than state: this changes on every keystroke and re-rendering the
   * whole editor for it would be absurd, and nothing on screen depends on the value.
   */
  const unsaved = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => { unsaved.current = dirty; }, []);

  /**
   * Where the editor is trying to go while unsaved text is in the way: another translation, or
   * "close". The pane asks about it in its own footer.
   *
   * This used to be `confirm()`, which is suppressed in enough contexts that the dialog never
   * appeared and its false return left the pane with no way out at all -- Escape and the close
   * button both silently did nothing, with the text still in the field.
   */
  const [pending, setPending] = useState<EditTarget | "close">();

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
  /*
   * The server resolves the pair when the URL names neither and reports what it chose, so the strip
   * reflects that decision rather than duplicating the rules.
   *
   * Empty rather than absent is how it answers before anything has been synchronised, and an empty
   * string is not a language: `??` kept it, so the strip was working from a code that names no
   * facet -- it read "Choose a language" beside a menu already sitting on the only entry it had,
   * and picking that entry changed nothing. `||` treats it as the nothing it is, and the site's own
   * default stands in until the server has something to say.
   */
  const page = rows.query.data?.pages[0];
  const shown: typeof filters = {
    ...filters,
    locale: filters.locale || page?.targetLocale || defaultLocale(locales),
    // No fallback for the comparison: with nothing synchronised there is nothing to read this
    // language against, and "None" is the honest answer rather than a language picked for the sake
    // of filling the slot.
    referenceLocale: filters.referenceLocale || page?.referenceLocale || null,
  };

  const current = facetFor(locales, shown.locale);
  const mode = editingMode(current);
  const comparing = shown.referenceLocale !== null && shown.referenceLocale !== shown.locale;
  const referenceName = localeName(locales, shown.referenceLocale);

  /**
   * Opening a translation, including one in another language.
   *
   * Correcting the reference language is editing it, so it moves the whole view rather than opening
   * a second field beside the first: two editable languages on screen at once is a way to save text
   * into the wrong one. The comparison follows, or the view ends up comparing a language with
   * itself and the reference column silently disappears.
   */
  const go = useCallback((target: EditTarget) => {
    setSelected(target);
    if (target.locale !== shown.locale) update(editingLocale(shown, target.locale));
  }, [shown.locale, shown.referenceLocale, update]);

  // Both routes out of an open translation: picking another row, and closing altogether.
  const select = useCallback((target: EditTarget) => {
    if (!unsaved.current || sameTarget(target, selected)) go(target);
    else setPending(target);
  }, [selected, go]);

  const close = useCallback(() => {
    if (unsaved.current) setPending("close");
    else setSelected(undefined);
  }, []);

  const discard = useCallback(() => {
    unsaved.current = false;
    if (pending === undefined || pending === "close") setSelected(undefined);
    else go(pending);
    setPending(undefined);
  }, [pending, go]);

  /*
   * Rows that are results on the strength of a language neither column shows. Search is
   * locale-blind, so pasting in an English sentence while editing Danish finds the key -- but
   * without saying how many rows came back that way, the list reads as though it ignored what was
   * typed. Counted over the rows in hand rather than the whole result, because that is all anyone
   * can scroll to; the grid keeps pulling pages until the two agree.
   */
  const elsewhere = useMemo(
    () => rows.keys.filter((key) =>
      matchedElsewhere(key, shown.query, [shown.locale, shown.referenceLocale]).length > 0).length,
    // Memoised because the whole loaded result is scanned and a keystroke in the search field
    // re-renders this component: the filter state is set synchronously and only the history write
    // is debounced, so without this a ten-character search walks a thousand-row list ten times.
    [rows.keys, shown.query, shown.locale, shown.referenceLocale],
  );

  /*
   * A queue in the order the application defines its keys, which is the order it is meant to be
   * worked in and the only one that makes "the next one" mean anything. True only when nothing else
   * is deciding the order or the contents: a search or another sort is named in the bar above, and
   * this one is the absence of anything there to read.
   */
  const queued = mode === "queue" &&
    shown.query === "" &&
    shown.sort === defaultFilters.sort &&
    shown.direction === defaultFilters.direction;

  const listState = describeListState({
    error: rows.query.error ?? undefined,
    loading: rows.query.isLoading,
    rowCount: rows.keys.length,
    totalKeys: facets.data?.totalKeys,
  });
  const syncing = sync.data?.some((source) => source.syncInProgress) ?? false;

  // Where an open translation sits in the result, so the pane can offer the rows either side of it
  // and say how much of a queue is left. Looked up by identity rather than remembered as a
  // position, because the row moves underneath: saving while sorted by what needs attention
  // reorders the list while the pane is still open on the row that moved.
  const index = selected === undefined
    ? -1
    : rows.keys.findIndex((key) => sameTarget(targetOf(key, selected.locale), selected));
  const row = index < 0 ? undefined : rows.keys[index];
  const step = (offset: number): EditTarget | undefined => {
    const neighbour = index < 0 ? undefined : rows.keys[index + offset];
    return neighbour && selected ? targetOf(neighbour, selected.locale) : undefined;
  };

  return (
    <main className="shell">
      <ContextStrip
        filters={shown}
        locales={locales}
        totalKeys={facets.data?.totalKeys}
        mode={mode}
        update={update}
      />

      <FilterBar
        filters={shown}
        namespaces={facets.data?.namespaces ?? []}
        update={update}
        searchRef={search}
      />

      <div className="board">
        <div className="results">
          {listState.kind === "rows" && (
            <div className="results__head">
              <span>
                <strong>{rows.total.toLocaleString()}</strong> {rows.total === 1 ? "key" : "keys"}
                {shown.query && <> matching “{shown.query}”</>}
                {/* A queue is worked from the top down, so what decides the top is part of what it
                    is. Said only where it is unstated: any other order is a chip in the bar above,
                    and this one is the absence of a chip. */}
                {queued && <>, in the order the application defines them</>}
              </span>
              {/* Said once here rather than only row by row, so the shape of the result is legible
                  before scrolling it: a search that mostly hit a language nobody is looking at is
                  a different thing from one that hit the words on screen. */}
              {elsewhere > 0 && (
                <span className="results__because">
                  {elsewhere.toLocaleString()} matched in a language you are not viewing
                </span>
              )}
              {/* A queue is worth narrowing to the work still in it, but not behind the editor's
                  back: the offer says how many, and taking it is one press. */}
              {mode === "queue" && shown.status === "All" && current && current.absentKeyCount > 0 && (
                <button type="button" className="link" onClick={() => update({ status: "Absent" })}>
                  Show only the {current.absentKeyCount.toLocaleString()} not written yet
                </button>
              )}
            </div>
          )}

          {listState.kind === "rows" ? (
            <KeyGrid
              keys={rows.keys}
              filters={shown}
              total={rows.total}
              locales={locales}
              namespaceCount={facets.data?.namespaces.length ?? 0}
              mode={mode}
              selected={selected}
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

          <div className="results__foot">
            <span>
              <strong>{(facets.data?.totalKeys ?? 0).toLocaleString()}</strong> keys
              {shown.namespace && <> in {shown.namespace}</>}
            </span>
            {/* Secondary, and said again in the strip at the top, so these are what goes first when
                the pane takes half the width. The shortcuts below are not repeated anywhere. */}
            {current && current.absentKeyCount > 0 && (
              <span className="results__aside">
                {current.absentKeyCount.toLocaleString()} not written in {current.name || current.code}
              </span>
            )}
            {current && current.needsReviewCount > 0 && (
              <span className="results__aside results__warning">
                {current.needsReviewCount.toLocaleString()} changed upstream
              </span>
            )}
            <span className="results__spacer" />
            {syncing && <span role="status">Syncing…</span>}
            {permissions.data && !permissions.data.canEdit && <span>View-only access</span>}
            <Shortcuts editing={selected !== undefined && row !== undefined} />
          </div>
        </div>

        {selected && row && shown.locale && (
          <TranslationDetail
            key={targetId(selected)}
            target={selected}
            row={row}
            bridge={bridge}
            locales={locales}
            reference={comparing && shown.referenceLocale
              ? { locale: shown.referenceLocale, name: referenceName }
              : undefined}
            mode={mode}
            term={shown.query}
            position={{ index: index + 1, total: rows.total }}
            previous={step(-1)}
            next={step(1)}
            canEdit={canEdit}
            pending={pending}
            onKeepEditing={() => setPending(undefined)}
            onDiscard={discard}
            onDirtyChange={onDirtyChange}
            select={select}
            switchLocale={(locale) => select({ ...selected, locale })}
            close={close}
          />
        )}
      </div>
    </main>
  );
};
