import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ModelDashboard } from "../components/model-dashboard";
import {
  filtersFromSearch,
  parseDashboardSearch,
  searchFromFilters,
} from "../lib/dashboard-search";

const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const { loadDashboardData } = await import("../lib/dashboard-data.server");
  return loadDashboardData();
});

export const Route = createFileRoute("/")({
  validateSearch: parseDashboardSearch,
  loader: () => getDashboardData(),
  component: Home,
});

function Home() {
  const { lastPublishedAt, notices, sourceStatus } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <ModelDashboard
      filters={filtersFromSearch(search)}
      lastPublishedAt={lastPublishedAt}
      notices={notices}
      onFiltersChange={(filters) => {
        void navigate({
          replace: true,
          search: searchFromFilters(filters),
        });
      }}
      sourceStatus={sourceStatus}
    />
  );
}
