import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { CheckOutcome, SourceHealth } from "@duskline/lifecycle";
import { timestampDateLabel } from "../lib/lifecycle-table";
import { platformLabel, providerLabel } from "../lib/labels";

const getSourceCoverage = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadSourceCoverageData } =
      await import("../lib/dashboard-data.server");
    return loadSourceCoverageData();
  },
);

export const Route = createFileRoute("/sources")({
  loader: () => getSourceCoverage(),
  head: () => ({
    meta: [
      { title: "Official sources — Duskline" },
      {
        name: "description",
        content:
          "The official lifecycle sources Duskline verifies each day and the exact scope of each check.",
      },
    ],
  }),
  component: Sources,
});

const snapshotLabel = (status: SourceHealth | null): string =>
  (
    ({
      healthy: "Trusted",
      stale: "Stale",
      error: "Error",
      invalid: "Invalid",
      not_collected: "Not collected",
      unknown: "Unknown",
    }) as const
  )[status ?? "not_collected"];

const outcomeLabel = (outcome: CheckOutcome): string =>
  (
    ({
      success: "Verified",
      failure: "Failed",
      not_attempted: "Not attempted",
    }) as const
  )[outcome];

function Sources() {
  const { checks, sources } = Route.useLoaderData();
  const healthy = sources.filter((source) => source.outcome === "success");

  return (
    <main
      className="mx-auto w-full max-w-3xl px-3 py-8 sm:px-5 md:py-14"
      id="main-content"
    >
      <Link
        className="text-sm text-stone-500 underline underline-offset-4 hover:text-stone-950"
        to="/"
      >
        ← Model deprecations
      </Link>

      <header className="pt-8 pb-10">
        <h1 className="text-4xl leading-none font-medium md:text-5xl">
          Official sources
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-500">
          Duskline reports only what these sources publish. A successful check
          means retrieval, parsing, and structural validation succeeded.
        </p>
        <p className="mt-2 text-sm text-stone-500 tabular-nums">
          {checks.status === "not_checked"
            ? "Awaiting first verification"
            : `${healthy.length} of ${sources.length} sources verified · Checked ${timestampDateLabel(checks.last_checked_at)}`}
        </p>
      </header>

      <section
        aria-label="Source coverage"
        className="border-t border-stone-300"
      >
        {sources.length === 0 ? (
          <p className="py-8 text-sm text-stone-500">
            Source verification has not run yet.
          </p>
        ) : (
          sources.map((source) => (
            <article
              className="grid gap-3 border-b border-stone-300 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8"
              key={source.sourceId}
            >
              <div>
                <h2 className="font-medium">{source.label}</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {providerLabel(source.provider)} ·{" "}
                  {platformLabel(source.platform)}
                </p>
                <p className="mt-2 max-w-xl text-sm leading-relaxed">
                  {source.scope}
                </p>
                <a
                  className="mt-2 inline-block text-sm underline underline-offset-4 hover:text-stone-500"
                  href={source.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Official source <span aria-hidden="true">↗</span>
                </a>
              </div>
              <dl className="grid content-start gap-1 text-sm tabular-nums sm:min-w-48">
                <div className="flex justify-between gap-5">
                  <dt className="text-stone-500">Latest check</dt>
                  <dd
                    className={
                      source.outcome === "success"
                        ? "text-stone-950"
                        : "text-amber-900"
                    }
                  >
                    {outcomeLabel(source.outcome)}
                  </dd>
                </div>
                <div className="flex justify-between gap-5">
                  <dt className="text-stone-500">Last success</dt>
                  <dd>{timestampDateLabel(source.lastSuccessfulCheckAt)}</dd>
                </div>
                <div className="flex justify-between gap-5">
                  <dt className="text-stone-500">Published snapshot</dt>
                  <dd
                    className={
                      source.snapshotStatus === "healthy"
                        ? undefined
                        : "text-amber-900"
                    }
                  >
                    {snapshotLabel(source.snapshotStatus)}
                  </dd>
                </div>
                <div className="flex justify-between gap-5">
                  <dt className="text-stone-500">Retained records</dt>
                  <dd>{source.recordCount}</dd>
                </div>
                {source.errorCode ? (
                  <div className="flex justify-between gap-5">
                    <dt className="text-stone-500">Reason</dt>
                    <dd className="font-mono text-xs text-amber-900">
                      {source.errorCode}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </article>
          ))
        )}
      </section>

      <p className="pt-6 text-sm leading-relaxed text-stone-500">
        Absence is not proof that a model is active. It can also mean the fact
        is outside a source&apos;s stated coverage. OpenRouter is authoritative
        only for its own catalog and expiration metadata.
      </p>
    </main>
  );
}
