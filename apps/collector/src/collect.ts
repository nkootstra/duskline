import {
  canonicalizeChanges,
  canonicalizeCheckStatus,
  canonicalizeCurrent,
  recordIdentity,
  semanticDataset,
  semanticRecord,
  sha256,
  stableJson,
  type ChangeDetail,
  type ChangeEvent,
  type ChangeField,
  type ChangeHistory,
  type ChangeKind,
  type ChangeValue,
  type CheckStatusDataset,
  type CurrentDataset,
  type LifecycleRecord,
  type SourceStatus,
} from "@duskline/lifecycle";
import type {
  SourceDefinition,
  SourceFailure,
  SourceSuccess,
} from "@duskline/providers";

export interface CollectionOutput {
  readonly current: CurrentDataset;
  readonly changes: ChangeHistory;
  readonly changed: boolean;
  readonly degraded: boolean;
}

export const buildCheckStatus = (
  previous: CheckStatusDataset,
  expectedSources: ReadonlyArray<SourceDefinition>,
  successes: ReadonlyArray<SourceSuccess>,
  failures: ReadonlyArray<SourceFailure>,
  checkedAt: string,
): CheckStatusDataset => {
  const previousBySource = new Map(
    previous.sources.map((source) => [source.source_id, source]),
  );
  const successIds = new Set(successes.map((success) => success.source.id));
  const failureBySource = new Map(
    failures.map((failure) => [failure.source_id, failure]),
  );

  return canonicalizeCheckStatus({
    schema_version: 1,
    last_checked_at: checkedAt,
    status: failures.length > 0 ? "degraded" : "healthy",
    sources: expectedSources.map((source) => {
      const succeeded = successIds.has(source.id);
      const failure = failureBySource.get(source.id);
      if (succeeded === Boolean(failure)) {
        throw new Error(
          succeeded
            ? `Source produced success and failure: ${source.id}`
            : `Missing collection outcome for ${source.id}`,
        );
      }
      return {
        source_id: source.id,
        provider: source.provider,
        platform: source.platform,
        label: source.label,
        scope: source.scope,
        source_url: source.url,
        outcome: succeeded ? ("success" as const) : ("failure" as const),
        checked_at: checkedAt,
        last_successful_check_at: succeeded
          ? checkedAt
          : (previousBySource.get(source.id)?.last_successful_check_at ?? null),
        error_code: failure?.code ?? null,
      };
    }),
  });
};

const same = (left: unknown, right: unknown): boolean =>
  stableJson(left) === stableJson(right);

const classifyChange = (
  before: LifecycleRecord,
  after: LifecycleRecord,
): ChangeKind | null => {
  if (before.status !== after.status) return "status_changed";
  if (
    before.announcement_date !== after.announcement_date ||
    before.deprecation_date !== after.deprecation_date ||
    before.shutdown_date !== after.shutdown_date
  ) {
    return "dates_changed";
  }
  if (!same(before.replacement_models, after.replacement_models)) {
    return "replacements_changed";
  }
  return null;
};

const CHANGE_FIELDS = [
  "status",
  "announcement_date",
  "deprecation_date",
  "shutdown_date",
  "replacement_models",
] as const satisfies ReadonlyArray<ChangeField>;

const changeValue = (
  record: LifecycleRecord | null,
  field: ChangeField,
): ChangeValue => (record ? record[field] : null);

const isEmptyChangeValue = (value: ChangeValue): boolean =>
  value === null || (Array.isArray(value) && value.length === 0);

const changesFor = (
  before: LifecycleRecord | null,
  after: LifecycleRecord | null,
): Array<ChangeDetail> =>
  CHANGE_FIELDS.flatMap((field) => {
    const previous = changeValue(before, field);
    const next = changeValue(after, field);
    if (same(previous, next)) return [];
    if (!before && field !== "status" && isEmptyChangeValue(next)) return [];
    if (!after && field !== "status" && isEmptyChangeValue(previous)) return [];
    return [{ field, before: previous, after: next }];
  });

const eventFor = async (
  publishedAt: string,
  kind: ChangeKind,
  identity: string,
  before: LifecycleRecord | null,
  after: LifecycleRecord | null,
): Promise<ChangeEvent> => {
  const record = after ?? before;
  if (!record) throw new Error("change event requires a record");
  return {
    id: await sha256({
      publishedAt,
      kind,
      identity,
      before: before ? semanticRecord(before) : null,
      after: after ? semanticRecord(after) : null,
    }),
    published_at: publishedAt,
    kind,
    identity,
    source_id: record.source_id,
    provider: record.provider,
    platform: record.platform,
    model_id: record.model_id,
    changes: changesFor(before, after),
  };
};

const preserveObservation = (
  records: ReadonlyArray<LifecycleRecord>,
  previous: ReadonlyArray<LifecycleRecord>,
): Array<LifecycleRecord> => {
  const prior = new Map(
    previous.map((record) => [recordIdentity(record), record]),
  );
  return records.map((record) => {
    const old = prior.get(recordIdentity(record));
    return old && same(semanticRecord(old), semanticRecord(record))
      ? old
      : record;
  });
};

const successfulStatus = (
  result: SourceSuccess,
  records: ReadonlyArray<LifecycleRecord>,
  previousStatus: SourceStatus | undefined,
): SourceStatus => ({
  source_id: result.source.id,
  provider: result.source.provider,
  platform: result.source.platform,
  status: "healthy",
  record_count: records.length,
  content_hash: result.contentHash,
  last_successful_observation_at:
    previousStatus?.content_hash === result.contentHash
      ? previousStatus.last_successful_observation_at
      : result.observedAt,
  error_code: null,
});

const failedStatus = (
  source: SourceDefinition,
  failure: SourceFailure,
  previousStatus: SourceStatus | undefined,
): SourceStatus =>
  previousStatus
    ? {
        ...previousStatus,
        status: previousStatus.record_count > 0 ? "stale" : "not_collected",
        error_code: failure.code,
      }
    : {
        source_id: source.id,
        provider: source.provider,
        platform: source.platform,
        status: "not_collected",
        record_count: 0,
        content_hash: null,
        last_successful_observation_at: null,
        error_code: failure.code,
      };

export const mergeCollection = async (
  previous: CurrentDataset,
  history: ChangeHistory,
  expectedSources: ReadonlyArray<SourceDefinition>,
  successes: ReadonlyArray<SourceSuccess>,
  failures: ReadonlyArray<SourceFailure>,
  publishedAt: string,
): Promise<CollectionOutput> => {
  const previousBySource = new Map<string, Array<LifecycleRecord>>();
  for (const record of previous.records) {
    const records = previousBySource.get(record.source_id) ?? [];
    records.push(record);
    previousBySource.set(record.source_id, records);
  }
  const statusBySource = new Map(
    previous.source_status.map((status) => [status.source_id, status]),
  );
  const successBySource = new Map<string, SourceSuccess>(
    successes.map((success) => [success.source.id, success]),
  );
  const failureBySource = new Map<string, SourceFailure>(
    failures.map((failure) => [failure.source_id, failure]),
  );
  if (
    successBySource.size !== successes.length ||
    failureBySource.size !== failures.length
  ) {
    throw new Error("A source produced more than one collection outcome");
  }
  const expectedIds = new Set<string>(
    expectedSources.map((source) => source.id),
  );
  for (const sourceId of [
    ...successBySource.keys(),
    ...failureBySource.keys(),
  ]) {
    if (!expectedIds.has(sourceId)) {
      throw new Error(`Unexpected collection outcome for ${sourceId}`);
    }
  }

  const records: Array<LifecycleRecord> = [];
  const sourceStatus: Array<SourceStatus> = [];
  for (const source of expectedSources) {
    const success = successBySource.get(source.id);
    const failure = failureBySource.get(source.id);
    if (success && failure) {
      throw new Error(`Source produced success and failure: ${source.id}`);
    }
    if (!success && !failure) {
      throw new Error(`Missing collection outcome for ${source.id}`);
    }
    const priorStatus = statusBySource.get(source.id);
    const priorRecords = previousBySource.get(source.id) ?? [];
    if (success) {
      const nextRecords = preserveObservation(success.records, priorRecords);
      records.push(...nextRecords);
      sourceStatus.push(successfulStatus(success, nextRecords, priorStatus));
      continue;
    }
    if (failure) {
      records.push(...priorRecords);
      sourceStatus.push(failedStatus(source, failure, priorStatus));
      continue;
    }
    throw new Error(`Missing collection outcome for ${source.id}`);
  }

  const candidate = canonicalizeCurrent({
    schema_version: 1,
    last_published_at: previous.last_published_at,
    records,
    source_status: sourceStatus,
  });
  const changed = !same(semanticDataset(previous), semanticDataset(candidate));
  if (!changed) {
    return {
      current: previous,
      changes: history,
      changed: false,
      degraded: failures.length > 0,
    };
  }

  const previousRecords = new Map(
    previous.records.map((record) => [recordIdentity(record), record]),
  );
  const nextRecords = new Map(
    candidate.records.map((record) => [recordIdentity(record), record]),
  );
  const events: Array<ChangeEvent> = [];
  for (const [identity, after] of nextRecords) {
    const before = previousRecords.get(identity);
    if (!before) {
      events.push(await eventFor(publishedAt, "added", identity, null, after));
      continue;
    }
    const kind = classifyChange(before, after);
    if (kind) {
      events.push(await eventFor(publishedAt, kind, identity, before, after));
    }
  }
  for (const [identity, before] of previousRecords) {
    if (!nextRecords.has(identity)) {
      events.push(
        await eventFor(publishedAt, "removed", identity, before, null),
      );
    }
  }

  return {
    current: { ...candidate, last_published_at: publishedAt },
    changes: canonicalizeChanges({
      schema_version: 1,
      events: [...history.events, ...events],
    }),
    changed: true,
    degraded: failures.length > 0,
  };
};
