# Duskline

Duskline publishes a daily, provider-authoritative register of model
deprecations and deletion dates. The MVP intentionally focuses on explicit
lifecycle notices rather than mirroring every active model.

The repository is a Bun/Turborepo workspace built with Effect v4, TanStack
Start, TanStack Table, Alchemy v2, and Cloudflare Workers.

## Applications

- `apps/collector` fetches and validates the six independent official sources.
- `apps/web` renders the deprecation register. Its lifecycle column displays
  `Deprecated: … · Deletion: …` on one line, ordered by recent deletions
  newest-first, followed by upcoming deletion dates nearest-first. Model,
  provider, lifecycle, and replacement are intentionally fixed-order columns.
  Notices without a deletion date are omitted. The same
  Cloudflare deployment serves the committed contract as static assets at
  `/current.json`, `/changes.json`, and `/source-status.json`.

The complete source snapshot stays behind a TanStack Start server function.
The browser receives only display-ready deprecation notices with known deletion
dates, plus the small source-health summary. Models deleted within the previous
30 days appear before upcoming notices; older records, unknown-date notices, and
collector-only metadata are not included in the table payload.

Provider and platform identity are deliberately separate. An upstream OpenAI
retirement and OpenRouter availability for the same family remain distinct
records.

## Data contract

`data/current.json` is the primary frontend artifact. It contains:

- `schema_version`: currently `1`.
- `last_published_at`: the time of the last semantic publication, not the last
  successful check.
- `records`: normalized lifecycle notices with official source URLs,
  observation metadata, nullable dates, replacement models, and stable hashes.
- `source_status`: collection health, separate from model lifecycle state.

`data/changes.json` contains compact field-level additions, removals, status
changes, date changes, and replacement changes. It retains the latest 500
events. `data/source-status.json` is the standalone health view.

Lifecycle states (`legacy`, `deprecated`, `retired`, `removed`) describe a
model. Collection states (`healthy`, `stale`, `error`, `invalid`,
`not_collected`) describe whether a source snapshot can be trusted. If a fetch,
parser, or schema check fails, that source's prior records remain published and
its health becomes stale. A failed source never produces an empty replacement.

## Development

```sh
bun install
bun run test
bun run typecheck
bun run infra:check
bun run collect
bun run dev
```

`FIREWORKS_API_KEY` is optional for local work and required only for the
authenticated Fireworks models API. Without it, the changelog still collects
and the API source is reported as unavailable without exposing credentials.
Copy `.env.example` to `.env` and set `FIREWORKS_API_KEY`,
`CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`. Alchemy reads `.env`
automatically. The local file is ignored by Git.

The live collector uses official sources:

- OpenAI API deprecations
- Anthropic model deprecations
- Amazon Bedrock model lifecycle
- Fireworks changelog and models API
- OpenRouter models API with `output_modalities=all`

Provider fixture tests characterize each parser and fail closed when expected
structure disappears.

## Publication and deployment

The daily workflow runs at 04:17 UTC and can also be started manually. Collection
and publication are serialized. Tests and schema validation run before a
short-lived artifact is handed to a minimally privileged publication job. Only
the three allowlisted data files can be committed, and no commit is created when
the semantic dataset is unchanged.

`bun run deploy` first performs an authenticated collection and validates the
artifacts, then deploys the TanStack Start site and its static JSON as one
Cloudflare Worker:

```sh
bun run deploy -- --stage prod
```

Configure those values as a GitHub Actions variable and secret. Configure
`FIREWORKS_API_KEY` as a secret if the authenticated availability cross-check is
desired. The Fireworks credential is collector-only and is never bound to the
web Worker. On the first deployment, `Cloudflare.state()` provisions Alchemy's
state-store authentication and encryption secrets automatically. The repository
should remain private when reliable GitHub schedules are required; if made
public, add an external freshness monitor because GitHub can disable schedules
in inactive public repositories.

Move collection into Cloudflare Workflows/D1/R2 only when the product adds
sub-daily checks, user subscriptions, account-specific Bedrock regions, or raw
response retention. Those additions do not require changing the versioned
frontend contract.
