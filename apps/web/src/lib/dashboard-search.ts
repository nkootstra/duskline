import { Schema } from "effect";
import { Provider, type Provider as ProviderName } from "@duskline/lifecycle";

export interface DashboardSearch {
  readonly provider?: ProviderName;
  readonly q?: string;
  readonly page?: number;
}

export interface DashboardFilters {
  readonly provider: ProviderName | null;
  readonly query: string;
  readonly page: number;
}

export const parseDashboardSearch = (
  search: Record<string, unknown>,
): DashboardSearch => {
  const page =
    typeof search.page === "number"
      ? search.page
      : typeof search.page === "string"
        ? Number(search.page)
        : Number.NaN;
  return {
    ...(Schema.is(Provider)(search.provider)
      ? { provider: search.provider }
      : {}),
    ...(typeof search.q === "string" && search.q.length > 0
      ? { q: search.q }
      : {}),
    ...(Number.isInteger(page) && page > 1 ? { page } : {}),
  };
};

export const filtersFromSearch = (
  search: DashboardSearch,
): DashboardFilters => ({
  provider: search.provider ?? null,
  query: search.q ?? "",
  page: search.page ?? 1,
});

export const searchFromFilters = (
  filters: DashboardFilters,
): DashboardSearch => ({
  ...(filters.provider ? { provider: filters.provider } : {}),
  ...(filters.query ? { q: filters.query } : {}),
  ...(filters.page > 1 ? { page: filters.page } : {}),
});
