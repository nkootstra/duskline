import {
  modelLifecycleIdentity,
  recordIdentity,
  sortRecord,
} from "./canonical";
import type {
  LifecycleRecord,
  LifecycleStatus,
  Platform,
  Provider,
  SourceId,
} from "./schema";

const millisecondsPerDay = 86_400_000;

export type DeletionUrgency = "critical" | "warning" | null;

export interface LifecycleNoticeSource {
  readonly source_id: SourceId;
  readonly source_url: string;
}

export interface LifecycleNotice {
  readonly identity: string;
  readonly provider: Provider;
  readonly platform: Platform;
  readonly model_id: string;
  readonly canonical_model_id: string | null;
  readonly regions: ReadonlyArray<string>;
  readonly status: "deprecated" | "legacy" | "retired";
  readonly deprecation_date: string | null;
  readonly shutdown_date: string | null;
  readonly replacement_models: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<LifecycleNoticeSource>;
  readonly days_until_deletion: number | null;
  readonly urgency: DeletionUrgency;
}

export interface LifecycleEntry extends LifecycleNotice {
  readonly record_identities: ReadonlyArray<string>;
}

export const lifecycleNotice = ({
  record_identities: _recordIdentities,
  ...notice
}: LifecycleEntry): LifecycleNotice => notice;

export const daysUntilDate = (date: string, asOf: string): number => {
  const target = Date.parse(`${date}T00:00:00Z`);
  const current = Date.parse(`${asOf}T00:00:00Z`);
  return Math.round((target - current) / millisecondsPerDay);
};

export const deletionUrgency = (days: number): DeletionUrgency => {
  if (days < 0 || days > 30) return null;
  return days <= 7 ? "critical" : "warning";
};

export const effectiveLifecycleStatus = (
  record: Pick<LifecycleRecord, "status" | "shutdown_date">,
  asOf: string,
): LifecycleStatus =>
  record.shutdown_date &&
  record.shutdown_date < asOf &&
  (record.status === "deprecated" || record.status === "legacy")
    ? "retired"
    : record.status;

const earliestDate = (
  records: ReadonlyArray<LifecycleRecord>,
  field: "deprecation_date" | "shutdown_date",
): string | null =>
  records
    .flatMap((record) => (record[field] ? [record[field]] : []))
    .sort()[0] ?? null;

export const buildLifecycleEntries = (
  records: ReadonlyArray<LifecycleRecord>,
  asOf: string,
): Array<LifecycleEntry> => {
  const groups = new Map<string, Array<LifecycleRecord>>();
  for (const sourceRecord of records) {
    const record = {
      ...sourceRecord,
      status: effectiveLifecycleStatus(sourceRecord, asOf),
    };
    if (
      record.status !== "deprecated" &&
      record.status !== "legacy" &&
      record.status !== "retired" &&
      record.status !== "removed"
    ) {
      continue;
    }
    const identity = record.canonical_model_id
      ? modelLifecycleIdentity({
          ...record,
          model_id: record.canonical_model_id,
        })
      : recordIdentity(record);
    const group = groups.get(identity) ?? [];
    group.push(record);
    groups.set(identity, group);
  }

  return [...groups.entries()]
    .map(([identity, unsortedRecords]): LifecycleEntry => {
      const sourceRecords = unsortedRecords
        .map(sortRecord)
        .sort((left, right) => {
          const shutdown = (left.shutdown_date ?? "9999-12-31").localeCompare(
            right.shutdown_date ?? "9999-12-31",
          );
          return shutdown === 0
            ? left.source_id.localeCompare(right.source_id)
            : shutdown;
        });
      const primary = sourceRecords[0]!;
      const shutdownDate = earliestDate(sourceRecords, "shutdown_date");
      const daysUntilDeletion = shutdownDate
        ? daysUntilDate(shutdownDate, asOf)
        : null;
      return {
        identity,
        provider: primary.provider,
        platform: primary.platform,
        model_id: primary.model_id,
        canonical_model_id:
          sourceRecords
            .flatMap((record) =>
              record.canonical_model_id ? [record.canonical_model_id] : [],
            )
            .sort()[0] ?? null,
        regions: primary.regions,
        status:
          (shutdownDate && shutdownDate < asOf) ||
          sourceRecords.every(
            (record) =>
              record.status === "retired" || record.status === "removed",
          )
            ? "retired"
            : sourceRecords.every((record) => record.status === "legacy")
              ? "legacy"
              : "deprecated",
        deprecation_date: earliestDate(sourceRecords, "deprecation_date"),
        shutdown_date: shutdownDate,
        replacement_models: [
          ...new Set(
            sourceRecords.flatMap((record) => record.replacement_models),
          ),
        ].sort(),
        sources: [
          ...new Map(
            sourceRecords.map((record) => [
              `${record.source_id}:${record.source_url}`,
              {
                source_id: record.source_id,
                source_url: record.source_url,
              },
            ]),
          ).values(),
        ],
        days_until_deletion: daysUntilDeletion,
        urgency:
          daysUntilDeletion === null
            ? null
            : deletionUrgency(daysUntilDeletion),
        record_identities: sourceRecords.map(recordIdentity).sort(),
      };
    })
    .sort((left, right) => left.identity.localeCompare(right.identity));
};

export const buildLifecycleNotices = (
  records: ReadonlyArray<LifecycleRecord>,
  asOf: string,
): Array<LifecycleNotice> =>
  buildLifecycleEntries(records, asOf)
    .filter(
      (entry) =>
        entry.shutdown_date !== null &&
        entry.days_until_deletion !== null &&
        entry.days_until_deletion >= -30,
    )
    .sort((left, right) => {
      const leftIsPast = (left.days_until_deletion ?? 0) < 0;
      const rightIsPast = (right.days_until_deletion ?? 0) < 0;
      if (leftIsPast !== rightIsPast) return leftIsPast ? -1 : 1;
      const shutdown = (left.shutdown_date ?? "9999-12-31").localeCompare(
        right.shutdown_date ?? "9999-12-31",
      );
      if (leftIsPast && shutdown !== 0) return -shutdown;
      return shutdown === 0
        ? left.identity.localeCompare(right.identity)
        : shutdown;
    })
    .map(lifecycleNotice);
