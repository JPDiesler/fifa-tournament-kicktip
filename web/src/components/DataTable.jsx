import { useMemo, useState } from "react";
import { Table, SearchField, Select, ListBox, Pagination } from "@heroui/react";

// Shared admin table on HeroUI Table: search (SearchField), declarative per-column filters
// + page size (Select), native sorting, and pagination (Pagination). Columns:
//   { key, header, sortable?, isRowHeader?, render?(row), sort?(row),
//     filter?: { label, options:[{value,label}], match(row,value) } }
// `search(row)` (optional) returns the text the search box matches against.
const ALL = "__all";
const cmp = (a, b) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), "de", { numeric: true });

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
  const onFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v === ALL ? "" : v })); setPage(1); };

  return (
    <div className="space-y-3">
      {(search || filterCols.length > 0) && (
        <div className="flex flex-wrap items-end gap-2">
          {search && (
            <SearchField aria-label="Suche" value={query} onChange={onSearch} className="min-w-[10rem] flex-1">
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={searchPlaceholder} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          )}
          {filterCols.map((c) => (
            <Select key={c.key} aria-label={c.filter.label || c.header} className="w-44" value={filters[c.key] || ALL} onChange={(v) => onFilter(c.key, String(v))}>
              <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id={ALL} textValue={`${c.filter.label || c.header}: alle`}>{c.filter.label || c.header}: alle<ListBox.ItemIndicator /></ListBox.Item>
                  {c.filter.options.map((o) => <ListBox.Item key={o.value} id={o.value} textValue={o.label}>{o.label}<ListBox.ItemIndicator /></ListBox.Item>)}
                </ListBox>
              </Select.Popover>
            </Select>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* left: page-size picker + range summary */}
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Zeilen</span>
          <Select aria-label="Zeilen pro Seite" className="w-20" value={String(pageSize)} onChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                {pageSizes.map((n) => <ListBox.Item key={n} id={String(n)} textValue={String(n)}>{n}<ListBox.ItemIndicator /></ListBox.Item>)}
              </ListBox>
            </Select.Popover>
          </Select>
          {total > 0 && <span className="tabular-nums">{start + 1}–{Math.min(start + pageSize, total)} von {total}</span>}
        </div>
        {/* right: page navigation only */}
        {pages > 1 && (
          <Pagination size="sm">
            <Pagination.Content>
              <Pagination.Item>
                <Pagination.Previous isDisabled={cur <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))}><Pagination.PreviousIcon /></Pagination.Previous>
              </Pagination.Item>
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Pagination.Item key={p}>
                  <Pagination.Link isActive={p === cur} onPress={() => setPage(p)}>{p}</Pagination.Link>
                </Pagination.Item>
              ))}
              <Pagination.Item>
                <Pagination.Next isDisabled={cur >= pages} onPress={() => setPage((p) => Math.min(pages, p + 1))}><Pagination.NextIcon /></Pagination.Next>
              </Pagination.Item>
            </Pagination.Content>
          </Pagination>
        )}
      </div>
    </div>
  );
}
