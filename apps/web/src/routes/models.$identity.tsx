import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type {
  ChangeEvent,
  ChangeValue,
  CheckOutcome,
  LifecycleNotice,
} from "@duskline/lifecycle";
import { dateLabel, timestampDateLabel } from "../lib/lifecycle-table";
import { platformLabel, providerLabel } from "../lib/labels";

const getModelPassport = createServerFn({ method: "GET" })
  .validator((identity: string) => {
    if (!identity) throw new Error("Model identity is required");
    return identity;
  })
  .handler(async ({ data }) => {
    const { loadModelPassportData } =
      await import("../lib/dashboard-data.server");
    return loadModelPassportData(data);
  });

export const Route = createFileRoute("/models/$identity")({
  loader: async ({ params }) => {
    const passport = await getModelPassport({ data: params.identity });
    if (!passport) throw notFound();
    return passport;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.entry.model_id} lifecycle — Duskline`
          : "Model lifecycle — Duskline",
      },
      {
        name: "description",
        content: loaderData
          ? `Official deprecation, deletion, and replacement evidence for ${loaderData.entry.model_id}.`
          : "Official model lifecycle evidence.",
      },
    ],
  }),
  notFoundComponent: MissingPassport,
  component: ModelPassport,
});

const statusLabel = (status: LifecycleNotice["status"]): string =>
  status === "retired"
    ? "Deleted"
    : status === "legacy"
      ? "Legacy"
      : "Deprecated";

const checkLabel = (outcome: CheckOutcome): string =>
  (
    ({
      success: "Verified",
      failure: "Check failed",
      not_attempted: "Not checked",
    }) as const
  )[outcome];

const changeLabel = (event: ChangeEvent): string =>
  (
    ({
      added: "First published by Duskline",
      dates_changed: "Lifecycle dates changed",
      removed: "Removed from the source",
      replacements_changed: "Official replacement changed",
      status_changed: "Lifecycle status changed",
    }) as const
  )[event.kind];

const changeValueLabel = (value: ChangeValue): string => {
  if (value === null || (Array.isArray(value) && value.length === 0)) {
    return "none";
  }
  return typeof value === "string" ? value : value.join(", ");
};

function MissingPassport() {
  return (
    <main
      className="mx-auto w-full max-w-3xl px-3 py-14 sm:px-5"
      id="main-content"
    >
      <h1 className="text-3xl font-medium">Model evidence not found</h1>
      <p className="mt-3 text-sm text-stone-500">
        This lifecycle identity is invalid or is no longer retained.
      </p>
      <Link
        className="mt-6 inline-block text-sm underline underline-offset-4"
        to="/"
      >
        Return to model deprecations
      </Link>
    </main>
  );
}

function ModelPassport() {
  const { entry, evidence, history } = Route.useLoaderData();
  const deleted = entry.status === "retired";

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
        <p className="text-sm text-stone-500">
          {providerLabel(entry.provider)} · {platformLabel(entry.platform)}
        </p>
        <h1 className="mt-2 font-mono text-3xl leading-tight break-all md:text-4xl">
          {entry.model_id}
        </h1>
        <p
          className={`mt-4 text-sm font-medium ${deleted ? "text-stone-500" : "text-stone-950"}`}
        >
          {statusLabel(entry.status)}
          {entry.shutdown_date
            ? ` ${deleted ? "" : "on "}${dateLabel(entry.shutdown_date)}`
            : ""}
        </p>
      </header>

      <section
        aria-labelledby="lifecycle-heading"
        className="border-t border-stone-300 py-6"
      >
        <h2 className="font-medium" id="lifecycle-heading">
          Lifecycle
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-stone-500">Deprecated</dt>
            <dd className="mt-1 tabular-nums">
              {entry.deprecation_date
                ? dateLabel(entry.deprecation_date)
                : "Not announced"}
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">Deletion</dt>
            <dd className="mt-1 tabular-nums">
              {entry.shutdown_date
                ? dateLabel(entry.shutdown_date)
                : "Not announced"}
            </dd>
          </div>
          {entry.regions.length > 0 ? (
            <div>
              <dt className="text-stone-500">Regions</dt>
              <dd className="mt-1">{entry.regions.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section
        aria-labelledby="replacement-heading"
        className="border-t border-stone-300 py-6"
      >
        <h2 className="font-medium" id="replacement-heading">
          Official replacement
        </h2>
        {entry.replacement_models.length > 0 ? (
          <ul className="mt-3 grid gap-1">
            {entry.replacement_models.map((model) => (
              <li className="font-mono text-sm break-all" key={model}>
                {model}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-stone-500">
            No official replacement is listed.
          </p>
        )}
      </section>

      <section
        aria-labelledby="evidence-heading"
        className="border-t border-stone-300 py-6"
      >
        <h2 className="font-medium" id="evidence-heading">
          Evidence
        </h2>
        <div className="mt-4 grid gap-5">
          {evidence.map((source) => (
            <article
              className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6"
              key={`${source.sourceId}:${source.sourceUrl}`}
            >
              <div>
                <a
                  className="underline underline-offset-4 hover:text-stone-500"
                  href={source.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {source.label} <span aria-hidden="true">↗</span>
                </a>
                <p className="mt-1 text-stone-500">
                  Official provider or platform source
                </p>
              </div>
              <p
                className={`tabular-nums sm:text-right ${
                  source.outcome === "success"
                    ? "text-stone-500"
                    : "text-amber-900"
                }`}
              >
                {checkLabel(source.outcome)}{" "}
                {timestampDateLabel(source.checkedAt)}
                {source.lastObservedAt ? (
                  <span className="block text-stone-500">
                    Record observed {timestampDateLabel(source.lastObservedAt)}
                  </span>
                ) : null}
                {source.snapshotStatus &&
                source.snapshotStatus !== "healthy" ? (
                  <span className="block text-amber-900">
                    {source.snapshotStatus === "not_collected"
                      ? "Snapshot not collected"
                      : `${source.snapshotStatus[0]?.toUpperCase()}${source.snapshotStatus.slice(1)} snapshot`}
                  </span>
                ) : null}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="history-heading"
        className="border-t border-stone-300 py-6"
      >
        <h2 className="font-medium" id="history-heading">
          Duskline record history
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Publication history, not provider announcement history.
        </p>
        {history.length > 0 ? (
          <ol className="mt-4 grid gap-4">
            {history.map((event) => (
              <li className="text-sm" key={event.id}>
                <p>
                  {changeLabel(event)}{" "}
                  <span className="text-stone-500 tabular-nums">
                    · {timestampDateLabel(event.published_at)}
                  </span>
                </p>
                {event.changes.length > 0 ? (
                  <ul className="mt-1 text-stone-500">
                    {event.changes.map((change) => (
                      <li key={change.field}>
                        {change.field.replaceAll("_", " ")}:{" "}
                        {changeValueLabel(change.before)} →{" "}
                        {changeValueLabel(change.after)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-stone-500">
            No retained publication changes.
          </p>
        )}
      </section>
    </main>
  );
}
