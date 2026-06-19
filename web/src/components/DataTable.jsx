import { useMemo, useState } from "react";
import { Table } from "@heroui/react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

// Shared admin table on HeroUI Table: search, declarative per-column filters, native
// sorting, and pagination with a page-size picker (default 10). Columns:
//   { key, header, sortable?, isRowHeader?, render?(row), sort?(row),
//     filter?: { label, options:[{value,label}], match(row,value) } }
// `search(row)` (optional) returns the text the search box matches against.
const cmp = (a, b) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), "de", { numeric: true });
const CTRL = "rounded-md border border-border bg-field px-2 py-1 text-xs text-foreground outline-none focus:border-accent";

export default function DataTable({
  columns, rows, rowKey, search, searchPlaceholder = "Suchen …",
  pageSizes = [10, 25, 50], defaultPageSize = 10, ariaLabel = "Tabelle", empty = "Keine Einträge.",
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({}); // column key → selected value ("" = all)
  const [sort, setSort] = useState(null);      // { column, direction } | null
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const filterCols = columns.filter((c) => c.filter);

  const filtered = useMemo(() => {
    let r = rows;
    if (search && query.trim()) { const q = query.trim().toLowerCase(); r = r.filter((row) => String(search(row) ?? "").toLowerCase().includes(q)); }
    for (const c of filterCols) { const v = filters[c.key]; if (v) r = r.filter((row) => c.filter.match(row, v)); }
    return r;
  }, [rows, query, filters, search, filterCols]);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.column);
    if (!col) return filtered;
    const val = col.sort || ((row) => row[col.key]);
    const dir = sort.direction === "descending" ? -1 : 1;
    return [...filtered].sort((a, b) => cmp(val(a), val(b)) * dir);
  }, [filtered, sort, columns]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const onSearch = (v) => { setQuery(v); setPage(1); };
  const onFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  return (
    <div className="space-y-2">
      {(search || filterCols.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <div className="relative min-w-[8rem] flex-1">
              <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
              <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} className={`${CTRL} w-full pl-7`} />
            </div>
          )}
          {filterCols.map((c) => (
            <select key={c.key} value={filters[c.key] || ""} onChange={(e) => onFilter(c.key, e.target.value)} className={CTRL} aria-label={c.filter.label || c.header}>
              <option value="">{c.filter.label || c.header}: alle</option>
              {c.filter.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
        </div>
      )}

      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={ariaLabel} sortDescriptor={sort || undefined} onSortChange={(d) => { setSort(d); setPage(1); }}>
            <Table.Header>
              {columns.map((c) => (
                <Table.Column key={c.key} id={c.key} allowsSorting={!!c.sortable} isRowHeader={!!c.isRowHeader}>
                  {c.sortable
                    ? ({ sortDirection }) => <Table.SortableColumnHeader sortDirection={sortDirection}>{c.header}</Table.SortableColumnHeader>
                    : c.header}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body>
              {pageRows.map((row) => (
                <Table.Row key={rowKey(row)} id={rowKey(row)}>
                  {columns.map((c) => <Table.Cell key={c.key}>{c.render ? c.render(row) : row[c.key]}</Table.Cell>)}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      {total === 0 && <p className="py-6 text-center text-xs text-muted">{empty}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <div className="flex items-center gap-1.5">
          <span>Zeilen</span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className={CTRL} aria-label="Zeilen pro Seite">
            {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {total > 0 && <span className="tabular-nums">{start + 1}–{Math.min(start + pageSize, total)} von {total}</span>}
        </div>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Zurück" disabled={cur <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-overlay hover:text-foreground disabled:opacity-30"><ChevronLeft size={15} /></button>
            <span className="tabular-nums">{cur}/{pages}</span>
            <button type="button" aria-label="Weiter" disabled={cur >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-overlay hover:text-foreground disabled:opacity-30"><ChevronRight size={15} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
