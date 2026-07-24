import { useMemo } from "react";
import { Toggle } from "@base-ui/react/toggle";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  type LifecycleNotice,
  type Provider,
  type SourceStatusDataset,
} from "@duskline/lifecycle";
import { dateLabel, deletionCountdownLabel } from "../lib/lifecycle-table";
import type { DashboardFilters } from "../lib/dashboard-search";
import { cn } from "../lib/cn";

interface Props {
  readonly filters: DashboardFilters;
  readonly lastPublishedAt: string | null;
  readonly notices: Array<LifecycleNotice>;
  readonly onFiltersChange: (filters: DashboardFilters) => void;
  readonly sourceStatus: SourceStatusDataset;
}

const providerLabel = (provider: Provider): string =>
  (
    ({
      anthropic: "Anthropic",
      aws_bedrock: "Bedrock",
      fireworks: "Fireworks",
      openai: "OpenAI",
      openrouter: "OpenRouter",
    }) as const
  )[provider];

const columns: Array<ColumnDef<LifecycleNotice>> = [
  {
    accessorKey: "model_id",
    header: "Model",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono break-all">{row.original.model_id}</span>
    ),
  },
  {
    accessorKey: "provider",
    header: "Provider",
    enableSorting: false,
    cell: ({ row }) => providerLabel(row.original.provider),
  },
  {
    id: "lifecycle",
    header: "Lifecycle",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        Deprecated: {dateLabel(row.original.deprecation_date)}{" "}
        <span aria-hidden="true">·</span>{" "}
        <span className={cn(row.original.urgency && "font-medium")}>
          Deletion: {dateLabel(row.original.shutdown_date)}
          {row.original.days_until_deletion !== null &&
          (row.original.urgency || row.original.days_until_deletion < 0) ? (
            <>
              {" "}
              <span aria-hidden="true">·</span>{" "}
              {deletionCountdownLabel(row.original.days_until_deletion)}
            </>
          ) : null}
        </span>
      </span>
    ),
  },
  {
    id: "replacement",
    header: "Replacement",
    enableSorting: false,
    accessorFn: (record) => record.replacement_models.join(", "),
    cell: ({ row }) =>
      row.original.replacement_models.length > 0
        ? row.original.replacement_models.join(", ")
        : "—",
  },
  {
    id: "source",
    header: "Source",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.sources.map((source, index) => (
        <span key={source.source_id}>
          {index > 0 ? ", " : null}
          <a
            aria-label={`View official source ${index + 1} for ${row.original.model_id}`}
            className="touch-manipulation underline underline-offset-4 hover:text-stone-500"
            href={source.source_url}
            rel="noreferrer"
            target="_blank"
          >
            {row.original.sources.length > 1 ? `View ${index + 1}` : "View"}{" "}
            <span aria-hidden="true">↗</span>
          </a>
        </span>
      )),
  },
];

export function ModelDashboard({
  filters,
  lastPublishedAt,
  notices,
  onFiltersChange,
  sourceStatus,
}: Props) {
  const columnFilters = useMemo(
    () =>
      filters.provider ? [{ id: "provider", value: filters.provider }] : [],
    [filters.provider],
  );
  const pagination = useMemo(
    () => ({
      pageIndex: Math.max(0, filters.page - 1),
      pageSize: 25,
    }),
    [filters.page],
  );
  const table = useReactTable({
    data: notices,
    columns,
    autoResetPageIndex: false,
    state: {
      globalFilter: filters.query,
      columnFilters,
      pagination,
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  const staleSources = sourceStatus.sources.filter(
    (source) => source.status !== "healthy",
  );
  const providers = [...new Set(notices.map((record) => record.provider))].sort(
    (left, right) => providerLabel(left).localeCompare(providerLabel(right)),
  );
  const filteredRows = table.getFilteredRowModel().rows.length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-14">
      <header className="pb-8">
        <h1 className="text-balance text-4xl leading-none font-medium md:text-5xl">
          Model Deprecations
        </h1>
        <p className="mt-3 text-sm text-pretty text-stone-500 tabular-nums">
          Upcoming and recent deletion dates from official sources
          <span aria-hidden="true"> · </span>
          {lastPublishedAt
            ? `Updated ${new Date(lastPublishedAt).toLocaleDateString("en", {
                dateStyle: "medium",
                timeZone: "UTC",
              })}`
            : "Awaiting first collection"}
        </p>
      </header>

      {staleSources.length > 0 ? (
        <aside
          className="mb-5 text-sm text-amber-900 text-pretty"
          role="status"
        >
          <strong>{staleSources.length} sources stale.</strong>{" "}
          {lastPublishedAt
            ? "Last trusted data shown."
            : "Awaiting their first collection."}
        </aside>
      ) : null}

      <section className="scroll-mt-4 border-t border-stone-300" id="models">
        <div className="grid items-center gap-4 py-3.5 md:flex md:justify-between md:py-4">
          <p
            aria-live="polite"
            className="m-0 text-sm text-stone-500 tabular-nums"
          >
            {filteredRows} {filteredRows === 1 ? "model" : "models"}
          </p>
          <div className="grid items-center gap-2 md:flex md:flex-wrap">
            <div
              aria-label="Filter by provider"
              className="flex flex-wrap gap-1"
              role="group"
            >
              <Toggle
                className="min-h-9 touch-manipulation cursor-pointer border border-stone-300 bg-transparent px-2.5 py-1.5 text-sm hover:border-stone-500 focus-visible:border-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 data-[pressed]:border-stone-950 data-[pressed]:bg-stone-950 data-[pressed]:text-white"
                onPressedChange={() =>
                  onFiltersChange({
                    ...filters,
                    provider: null,
                    page: 1,
                  })
                }
                pressed={!filters.provider}
              >
                All
              </Toggle>
              {providers.map((providerOption) => (
                <Toggle
                  className="min-h-9 touch-manipulation cursor-pointer border border-stone-300 bg-transparent px-2.5 py-1.5 text-sm hover:border-stone-500 focus-visible:border-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 data-[pressed]:border-stone-950 data-[pressed]:bg-stone-950 data-[pressed]:text-white"
                  key={providerOption}
                  onPressedChange={(pressed) => {
                    onFiltersChange({
                      ...filters,
                      provider: pressed ? providerOption : null,
                      page: 1,
                    });
                  }}
                  pressed={filters.provider === providerOption}
                >
                  {providerLabel(providerOption)}
                </Toggle>
              ))}
            </div>
            <label className="block">
              <span className="sr-only">Search models</span>
              <input
                autoComplete="off"
                className="min-h-9 w-full border border-stone-300 bg-transparent px-2.5 py-1.5 text-sm placeholder:text-stone-400 hover:border-stone-500 focus-visible:border-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 md:w-50"
                name="models"
                onChange={(event) => {
                  onFiltersChange({
                    ...filters,
                    query: event.target.value,
                    page: 1,
                  });
                }}
                placeholder="Search models…"
                type="search"
                value={filters.query}
              />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto border-y border-stone-300">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th
                      aria-sort={
                        header.column.getIsSorted() === "asc"
                          ? "ascending"
                          : header.column.getIsSorted() === "desc"
                            ? "descending"
                            : undefined
                      }
                      className="border-b border-stone-300 px-2 py-3 text-left font-mono text-xs font-medium text-stone-500 uppercase"
                      key={header.id}
                    >
                      {header.isPlaceholder ? null : (
                        <>
                          {header.column.getCanSort() ? (
                            <button
                              className="touch-manipulation cursor-pointer bg-transparent p-0 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                              onClick={header.column.getToggleSortingHandler()}
                              type="button"
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {header.column.getIsSorted() === "asc"
                                ? " ↑"
                                : header.column.getIsSorted() === "desc"
                                  ? " ↓"
                                  : ""}
                            </button>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )
                          )}
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  className={cn(
                    "group",
                    row.original.urgency === "critical" &&
                      "bg-red-50 hover:bg-red-100",
                    row.original.urgency === "warning" &&
                      "bg-amber-50 hover:bg-amber-100",
                    row.original.status === "retired" &&
                      "bg-stone-100 text-stone-500 hover:bg-stone-200",
                    !row.original.urgency &&
                      row.original.status !== "retired" &&
                      "hover:bg-stone-100",
                  )}
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      className="border-b border-stone-300 px-2 py-3 text-left group-last:border-b-0"
                      key={cell.id}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.getRowModel().rows.length === 0 ? (
            <div className="grid min-h-56 place-items-center gap-1.5 text-sm text-stone-500">
              <strong className="text-stone-950">
                No matching deprecations.
              </strong>
              {notices.length === 0 ? (
                <span>The first publication has not landed yet.</span>
              ) : (
                <button
                  className="touch-manipulation cursor-pointer bg-transparent p-0 text-stone-950 underline underline-offset-4 hover:text-stone-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                  onClick={() =>
                    onFiltersChange({
                      provider: null,
                      query: "",
                      page: 1,
                    })
                  }
                  type="button"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : null}
        </div>
        {table.getPageCount() > 1 ? (
          <nav
            aria-label="Table pagination"
            className="flex items-center justify-between gap-4 pt-4 text-sm text-stone-500 tabular-nums md:justify-end"
          >
            <button
              className="touch-manipulation cursor-pointer bg-transparent p-0 underline underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 disabled:cursor-default disabled:opacity-40 disabled:no-underline"
              disabled={!table.getCanPreviousPage()}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  page: Math.max(1, filters.page - 1),
                })
              }
              type="button"
            >
              Previous
            </button>
            <span>
              {table.getState().pagination.pageIndex + 1} /{" "}
              {table.getPageCount()}
            </span>
            <button
              className="touch-manipulation cursor-pointer bg-transparent p-0 underline underline-offset-4 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950 disabled:cursor-default disabled:opacity-40 disabled:no-underline"
              disabled={!table.getCanNextPage()}
              onClick={() =>
                onFiltersChange({ ...filters, page: filters.page + 1 })
              }
              type="button"
            >
              Next
            </button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}
