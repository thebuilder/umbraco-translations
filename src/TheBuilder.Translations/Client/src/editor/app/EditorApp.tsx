import { useState } from "react";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { useFacets, useKeyRows, usePermissions, useSyncStatus } from "../api/queries.js";
import { KeyGrid } from "../components/KeyGrid.js";
import { TranslationDetail } from "../components/TranslationDetail.js";
import { useUrlFilters } from "../state/use-url-filters.js";
import { LocaleProgress, Toolbar } from "./Toolbar.js";
import { ScopeList } from "./ScopeList.js";
import { Summary } from "./Summary.js";

export const EditorApp = ({ bridge }: { bridge: BackofficeBridge }) => {
  const [filters, update] = useUrlFilters();
  const [selectedId, setSelectedId] = useState<string>();

  const facets = useFacets();
  const permissions = usePermissions();
  const sync = useSyncStatus();
  const rows = useKeyRows(filters);

  const locales = facets.data?.locales ?? [];
  // The server resolves the pair when the URL names neither, and reports what it chose. Reading it
  // back from the response keeps the toolbar honest without duplicating the resolution rules here.
  const page = rows.query.data?.pages[0];
  const shown: typeof filters = {
    ...filters,
    locale: filters.locale ?? page?.targetLocale ?? null,
    referenceLocale: filters.referenceLocale ?? page?.referenceLocale ?? null,
  };
  const syncing = sync.data?.some((source) => source.syncInProgress) ?? false;
  const localeName = locales.find((locale) => locale.code === shown.locale)?.name ?? shown.locale ?? "";

  return (
    <main className="shell">
      <header className="header">
        <div className="header__status">
          {syncing && <span className="muted" role="status">Synchronising…</span>}
          {permissions.data && !permissions.data.canEdit && (
            <span className="muted">You have read-only access</span>
          )}
          <LocaleProgress
            locale={locales.find((locale) => locale.code === shown.locale)}
            totalKeys={facets.data?.totalKeys ?? 0}
          />
        </div>
      </header>

      <Toolbar filters={shown} locales={locales} update={update} />

      <div className="layout">
        <ScopeList namespaces={facets.data?.namespaces ?? []} filters={shown} update={update} />

        <div className="grid-frame">
          <Summary keys={rows.keys} locale={shown.locale} total={rows.total} />
          <KeyGrid
            keys={rows.keys}
            filters={shown}
            total={rows.total}
            loading={rows.query.isLoading}
            error={rows.query.error ?? undefined}
            namespaceCount={facets.data?.namespaces.length ?? 0}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onLoadMore={() => void rows.query.fetchNextPage()}
            hasMore={rows.query.hasNextPage}
            loadingMore={rows.query.isFetchingNextPage}
            localeName={localeName}
          />
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
