import { useState } from "react";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { useFacets, useKeyRows, usePermissions, useSyncStatus } from "../api/queries.js";
import { KeyGrid } from "../components/KeyGrid.js";
import { TranslationDetail } from "../components/TranslationDetail.js";
import { useUrlFilters } from "../state/use-url-filters.js";
import { Toolbar } from "./Toolbar.js";

export const EditorApp = ({ bridge }: { bridge: BackofficeBridge }) => {
  const [filters, update] = useUrlFilters();
  const [selectedId, setSelectedId] = useState<string>();

  const facets = useFacets();
  const permissions = usePermissions();
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
  const current = locales.find((locale) => locale.code === shown.locale);
  const syncing = sync.data?.some((source) => source.syncInProgress) ?? false;

  return (
    <main className="shell">
      <Toolbar
        filters={shown}
        locales={locales}
        namespaces={facets.data?.namespaces ?? []}
        update={update}
      />

      <div className="board">
        <KeyGrid
          keys={rows.keys}
          filters={shown}
          total={rows.total}
          loading={rows.query.isLoading}
          error={rows.query.error ?? undefined}
          locales={locales}
          namespaceCount={facets.data?.namespaces.length ?? 0}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onLoadMore={() => void rows.query.fetchNextPage()}
          hasMore={rows.query.hasNextPage}
          loadingMore={rows.query.isFetchingNextPage}
        />

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
          {permissions.data && !permissions.data.canEdit && <span>Read-only access</span>}
        </div>

        {selectedId && (
          <TranslationDetail
            key={selectedId}
            id={selectedId}
            bridge={bridge}
            close={() => setSelectedId(undefined)}
          />
        )}
      </div>
    </main>
  );
};
