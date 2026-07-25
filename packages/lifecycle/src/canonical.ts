import type {
  ChangeEvent,
  ChangeHistory,
  CheckStatusDataset,
  CurrentDataset,
  LifecycleRecord,
  SourceStatus,
  SourceStatusDataset,
} from "./schema";

export const recordIdentity = (
  record: Pick<
    LifecycleRecord,
    "source_id" | "provider" | "platform" | "model_id" | "regions"
  >,
): string =>
  [
    record.source_id,
    record.provider,
    record.platform,
    record.model_id,
    [...record.regions].sort().join(","),
  ].join(":");

export const modelLifecycleIdentity = (
  record: Pick<
    LifecycleRecord,
    "provider" | "platform" | "model_id" | "regions"
  >,
): string =>
  [
    record.provider,
    record.platform,
    record.model_id,
    [...record.regions].sort().join(","),
  ].join(":");

const compareText = (left: string, right: string): number =>
  left.localeCompare(right, "en");

export const compareRecords = (
  left: LifecycleRecord,
  right: LifecycleRecord,
): number => compareText(recordIdentity(left), recordIdentity(right));

export const sortRecord = (record: LifecycleRecord): LifecycleRecord => ({
  ...record,
  regions: [...new Set(record.regions)].sort(compareText),
  replacement_models: [...new Set(record.replacement_models)].sort(compareText),
});

export const sortSourceStatus = (
  sources: ReadonlyArray<SourceStatus>,
): Array<SourceStatus> =>
  [...sources].sort((left, right) =>
    compareText(left.source_id, right.source_id),
  );

export const canonicalizeCurrent = (
  dataset: CurrentDataset,
): CurrentDataset => ({
  ...dataset,
  records: dataset.records.map(sortRecord).sort(compareRecords),
  source_status: sortSourceStatus(dataset.source_status),
});

export const assertUniqueRecords = (dataset: CurrentDataset): void => {
  const identities = new Set<string>();
  for (const record of dataset.records) {
    const identity = recordIdentity(record);
    if (identities.has(identity)) {
      throw new Error(`Duplicate lifecycle identity: ${identity}`);
    }
    identities.add(identity);
  }
};

export const assertDatasetIntegrity = (dataset: CurrentDataset): void => {
  assertUniqueRecords(dataset);
  const statuses = new Map<string, SourceStatus>();
  for (const status of dataset.source_status) {
    if (statuses.has(status.source_id)) {
      throw new Error(`Duplicate source status: ${status.source_id}`);
    }
    statuses.set(status.source_id, status);
  }

  const recordsBySource = new Map<string, Array<LifecycleRecord>>();
  for (const record of dataset.records) {
    const status = statuses.get(record.source_id);
    if (!status) {
      throw new Error(`Missing source status for ${record.source_id}`);
    }
    if (
      status.provider !== record.provider ||
      status.platform !== record.platform
    ) {
      throw new Error(`Source metadata mismatch for ${record.source_id}`);
    }
    const records = recordsBySource.get(record.source_id) ?? [];
    records.push(record);
    recordsBySource.set(record.source_id, records);
  }

  for (const status of dataset.source_status) {
    const count = recordsBySource.get(status.source_id)?.length ?? 0;
    if (count !== status.record_count) {
      throw new Error(
        `Source record count mismatch for ${status.source_id}: expected ${status.record_count}, received ${count}`,
      );
    }
  }
};

export const canonicalizeChanges = (history: ChangeHistory): ChangeHistory => ({
  ...history,
  events: [
    ...new Map(history.events.map((event) => [event.id, event])).values(),
  ]
    .sort((left, right) => {
      const date = compareText(left.published_at, right.published_at);
      return date === 0 ? compareText(left.id, right.id) : date;
    })
    .slice(-500),
});

export const canonicalizeSourceStatus = (
  dataset: SourceStatusDataset,
): SourceStatusDataset => ({
  ...dataset,
  sources: sortSourceStatus(dataset.sources),
});

export const canonicalizeCheckStatus = (
  dataset: CheckStatusDataset,
): CheckStatusDataset => ({
  ...dataset,
  sources: [...dataset.sources].sort((left, right) =>
    compareText(left.source_id, right.source_id),
  ),
});

export const stableJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const sha256 = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(
    typeof value === "string" ? value : stableJson(value),
  );
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  );
};

export const semanticRecord = (
  record: LifecycleRecord,
): Omit<LifecycleRecord, "observed_at" | "content_hash"> => {
  const {
    observed_at: _observedAt,
    content_hash: _hash,
    ...semantic
  } = sortRecord(record);
  return semantic;
};

export const semanticDataset = (dataset: CurrentDataset): unknown => ({
  schema_version: dataset.schema_version,
  records: dataset.records
    .map(semanticRecord)
    .sort((left, right) =>
      compareText(recordIdentity(left), recordIdentity(right)),
    ),
  source_status: sortSourceStatus(dataset.source_status).map((source) => ({
    source_id: source.source_id,
    provider: source.provider,
    platform: source.platform,
    status: source.status,
    record_count: source.record_count,
    content_hash: source.content_hash,
    error_code: source.error_code,
  })),
});

export const changeEventIdentity = (
  event: Pick<ChangeEvent, "published_at" | "kind" | "identity">,
): string => `${event.published_at}:${event.kind}:${event.identity}`;
