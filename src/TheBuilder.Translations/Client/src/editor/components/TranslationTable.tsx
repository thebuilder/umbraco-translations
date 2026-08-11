import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { MessageListItem, MessageListResponse } from "../../api/generated/models.js";
import { Button } from "../../bridge/uui/Button.js";
import type { EditorFilters } from "../filter-state.js";

const column = createColumnHelper<MessageListItem>();
const columns = [
  column.accessor("key", {
    header: "Key",
    cell: value => <><div className="key">{value.getValue()}</div><span className="muted">{value.row.original.namespace} · {value.row.original.locale}</span></>,
  }),
  column.accessor("defaultPreview", { header: "Application default" }),
  column.accessor("overridePreview", {
    header: "Custom text",
    cell: value => value.getValue() ?? <span className="muted">Uses default</span>,
  }),
  column.display({
    id: "status",
    header: "Status",
    cell: value => value.row.original.state === "Missing"
      ? <span className="tag tag--warning">Removed</span>
      : value.row.original.needsReview
      ? <span className="tag tag--warning">Needs review</span>
      : value.row.original.hasOverride ? <span className="tag">Overridden</span> : null,
  }),
];

export const TranslationTable = ({ data, filters, loading, fetching, error, select, changePage }: {
  data?: MessageListResponse;
  filters: EditorFilters;
  loading: boolean;
  fetching: boolean;
  error?: Error;
  select: (id: string) => void;
  changePage: (page: number) => void;
}) => {
  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: data?.total ?? 0,
  });
  const first = data?.total ? (filters.page - 1) * filters.pageSize + 1 : 0;
  const last = data ? Math.min(filters.page * filters.pageSize, data.total) : 0;

  return <section className="table-frame" aria-busy={fetching}>
    {error ? <p className="panel error">{error.message}</p>
      : loading ? <p className="panel">Loading translations…</p>
      : data?.items.length === 0 ? <p className="panel">No translations match these filters.</p>
      : <table>
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header =>
          <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map(row =>
          <tr key={row.id} onClick={() => select(row.original.id)}>{row.getVisibleCells().map(cell =>
            <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>}
    <div className="pagination">
      <span>{data ? `${first}–${last} of ${data.total}` : ""}</span>
      <Button disabled={filters.page <= 1} onClick={() => changePage(filters.page - 1)}>Previous</Button>
      <Button disabled={!data || last >= data.total} onClick={() => changePage(filters.page + 1)}>Next</Button>
    </div>
  </section>;
};
