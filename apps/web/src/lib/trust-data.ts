import { Schema } from "effect";
import {
  Sha256,
  buildLifecycleEntries,
  lifecycleIdentityKey,
  lifecycleNotice,
  recordIdentity,
  type ChangeEvent,
  type ChangeHistory,
  type CheckOutcome,
  type CheckStatusDataset,
  type CurrentDataset,
  type LifecycleEntry,
  type LifecycleNotice,
  type Platform,
  type Provider,
  type SourceHealth,
  type SourceId,
} from "@duskline/lifecycle";
import { dateLabel } from "./lifecycle-table";

export interface VerificationSummary {
  readonly label: string;
  readonly tone: "neutral" | "warning";
}

export interface SourceCoverage {
  readonly sourceId: SourceId;
  readonly provider: Provider;
  readonly platform: Platform;
  readonly label: string;
  readonly scope: string;
  readonly sourceUrl: string;
  readonly outcome: CheckOutcome;
  readonly checkedAt: string | null;
  readonly lastSuccessfulCheckAt: string | null;
  readonly errorCode: string | null;
  readonly snapshotStatus: SourceHealth | null;
  readonly recordCount: number;
}

export interface PassportEvidence {
  readonly sourceId: SourceId;
  readonly label: string;
  readonly sourceUrl: string;
  readonly outcome: CheckOutcome;
  readonly checkedAt: string | null;
  readonly snapshotStatus: SourceHealth | null;
  readonly lastObservedAt: string | null;
}

export interface ModelPassport {
  readonly entry: LifecycleNotice;
  readonly evidence: ReadonlyArray<PassportEvidence>;
  readonly history: ReadonlyArray<ChangeEvent>;
}

export interface DashboardNotice extends LifecycleNotice {
  readonly passport_id: string;
}

export interface LifecycleEntryIndex {
  readonly byKey: ReadonlyMap<string, LifecycleEntry>;
  readonly keyByIdentity: ReadonlyMap<string, string>;
}

const checkedWhen = (checkedAt: string, today: string): string =>
  checkedAt.slice(0, 10) === today
    ? "today"
    : `on ${dateLabel(checkedAt.slice(0, 10))}`;

export const verificationSummary = (
  checks: CheckStatusDataset,
  lastPublishedAt: string | null,
  today: string,
): VerificationSummary => {
  if (checks.status === "not_checked" || !checks.last_checked_at) {
    return {
      tone: "neutral",
      label: "Awaiting first source verification",
    };
  }

  const verified = checks.sources.filter(
    (source) => source.outcome === "success",
  ).length;
  const total = checks.sources.length;
  const when = checkedWhen(checks.last_checked_at, today);
  if (checks.status === "degraded") {
    return {
      tone: "warning",
      label: `Checked ${when} · ${verified} of ${total} sources verified · Last trusted facts retained`,
    };
  }

  const sourceLabel = total === 1 ? "source" : "sources";
  const changed = lastPublishedAt
    ? `Lifecycle facts last changed ${dateLabel(lastPublishedAt.slice(0, 10))}`
    : "Awaiting first lifecycle publication";
  return {
    tone: "neutral",
    label: `Verified against ${total} official ${sourceLabel} ${when} · ${changed}`,
  };
};

export const buildSourceCoverage = (
  checks: CheckStatusDataset,
  current: CurrentDataset,
): Array<SourceCoverage> => {
  const snapshots = new Map(
    current.source_status.map((source) => [source.source_id, source]),
  );
  return checks.sources.map((source) => {
    const snapshot = snapshots.get(source.source_id);
    return {
      sourceId: source.source_id,
      provider: source.provider,
      platform: source.platform,
      label: source.label,
      scope: source.scope,
      sourceUrl: source.source_url,
      outcome: source.outcome,
      checkedAt: source.checked_at,
      lastSuccessfulCheckAt: source.last_successful_check_at,
      errorCode: source.error_code,
      snapshotStatus: snapshot?.status ?? null,
      recordCount: snapshot?.record_count ?? 0,
    };
  });
};

const buildModelPassportFromEntry = (
  entry: LifecycleEntry,
  current: CurrentDataset,
  changes: ChangeHistory,
  checks: CheckStatusDataset,
): ModelPassport => {
  const recordIdentities = new Set(entry.record_identities);
  const records = current.records.filter((record) =>
    recordIdentities.has(recordIdentity(record)),
  );
  const checksBySource = new Map(
    checks.sources.map((source) => [source.source_id, source]),
  );
  const snapshotsBySource = new Map(
    current.source_status.map((source) => [source.source_id, source]),
  );

  return {
    entry: lifecycleNotice(entry),
    evidence: entry.sources.map((source) => {
      const check = checksBySource.get(source.source_id);
      const snapshot = snapshotsBySource.get(source.source_id);
      const lastObservedAt =
        records
          .filter((record) => record.source_id === source.source_id)
          .map((record) => record.observed_at)
          .sort()
          .at(-1) ?? null;
      return {
        sourceId: source.source_id,
        label: check?.label ?? source.source_id,
        sourceUrl: source.source_url,
        outcome: check?.outcome ?? "not_attempted",
        checkedAt: check?.checked_at ?? null,
        snapshotStatus: snapshot?.status ?? null,
        lastObservedAt,
      };
    }),
    history: changes.events
      .filter((event) => recordIdentities.has(event.identity))
      .sort((left, right) =>
        right.published_at.localeCompare(left.published_at),
      )
      .slice(0, 10),
  };
};

export const buildModelPassport = (
  identity: string,
  current: CurrentDataset,
  changes: ChangeHistory,
  checks: CheckStatusDataset,
  asOf: string,
): ModelPassport | null => {
  const entry = buildLifecycleEntries(current.records, asOf).find(
    (candidate) => candidate.identity === identity,
  );
  return entry
    ? buildModelPassportFromEntry(entry, current, changes, checks)
    : null;
};

export const buildLifecycleEntryIndex = async (
  entries: ReadonlyArray<LifecycleEntry>,
): Promise<LifecycleEntryIndex> => {
  const keyedEntries = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      key: await lifecycleIdentityKey(entry.identity),
    })),
  );
  return {
    byKey: new Map(keyedEntries.map(({ entry, key }) => [key, entry])),
    keyByIdentity: new Map(
      keyedEntries.map(({ entry, key }) => [entry.identity, key]),
    ),
  };
};

export const buildModelPassportByKey = async (
  key: string,
  current: CurrentDataset,
  changes: ChangeHistory,
  checks: CheckStatusDataset,
  asOf: string,
  index?: LifecycleEntryIndex,
): Promise<ModelPassport | null> => {
  if (!Schema.is(Sha256)(key)) return null;
  const entries =
    index ??
    (await buildLifecycleEntryIndex(
      buildLifecycleEntries(current.records, asOf),
    ));
  const entry = entries.byKey.get(key);
  return entry
    ? buildModelPassportFromEntry(entry, current, changes, checks)
    : null;
};
