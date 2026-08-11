import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { api } from "../../api/generated/client.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { TranslationDetail } from "../components/TranslationDetail.js";
import { TranslationFilters } from "../components/TranslationFilters.js";
import { TranslationTable } from "../components/TranslationTable.js";
import { readFilters, writeFilters } from "../filter-state.js";

export const EditorApp = ({ bridge }: { bridge: BackofficeBridge }) => {
  const [filters, setFilters] = useState(readFilters);
  const [selectedId, setSelectedId] = useState<string>();
  const deferredQuery = useDeferredValue(filters.query);
  const messages = useQuery({
    queryKey: ["messages", { ...filters, query: deferredQuery }],
    queryFn: () => api.messages({ ...filters, query: deferredQuery }),
    placeholderData: keepPreviousData,
  });

  const updateFilters = (patch: Partial<typeof filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    writeFilters(next);
  };

  return <main className="shell">
    <header className="header">
      <div><h1>Translations</h1><p className="muted">Application defaults with editorial overrides.</p></div>
    </header>
    <TranslationFilters filters={filters} update={updateFilters} />
    <div className="layout">
      <TranslationTable
        data={messages.data}
        filters={filters}
        loading={messages.isLoading}
        fetching={messages.isFetching}
        error={messages.error ?? undefined}
        select={setSelectedId}
        changePage={page => updateFilters({ page })}
      />
      {selectedId && <TranslationDetail key={selectedId} id={selectedId} bridge={bridge} close={() => setSelectedId(undefined)} />}
    </div>
  </main>;
};
