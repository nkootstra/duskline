import { Schema } from "effect";

export const SOURCE_IDS = [
  "openai-lifecycle",
  "anthropic-lifecycle",
  "bedrock-lifecycle",
  "fireworks-changelog",
  "fireworks-models",
  "openrouter-models",
] as const;

export const SourceId = Schema.Literals(SOURCE_IDS);

export const Provider = Schema.Literals([
  "openai",
  "anthropic",
  "aws_bedrock",
  "fireworks",
  "openrouter",
]);

export const Platform = Schema.Literals([
  "direct",
  "bedrock",
  "fireworks_serverless",
  "openrouter",
]);

export const LifecycleStatus = Schema.Literals([
  "legacy",
  "deprecated",
  "retired",
  "removed",
  "unknown",
]);

export const SourceHealth = Schema.Literals([
  "healthy",
  "stale",
  "error",
  "invalid",
  "not_collected",
  "unknown",
]);

export const CheckStatus = Schema.Literals([
  "healthy",
  "degraded",
  "not_checked",
]);

export const CheckOutcome = Schema.Literals([
  "success",
  "failure",
  "not_attempted",
]);

const isCalendarDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isUtcTimestamp = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

export const NonEmptyString = Schema.NonEmptyString;
export const IsoDate = Schema.String.pipe(
  Schema.refine((value): value is string => isCalendarDate(value), {
    expected: "a valid ISO calendar date (YYYY-MM-DD)",
  }),
);
export const UtcTimestamp = Schema.String.pipe(
  Schema.refine((value): value is string => isUtcTimestamp(value), {
    expected: "a canonical UTC ISO-8601 timestamp",
  }),
);
export const HttpUrl = Schema.String.pipe(
  Schema.refine((value): value is string => isHttpUrl(value), {
    expected: "an HTTP or HTTPS URL",
  }),
);
export const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
export const NonNegativeInteger = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
);

const NullableString = Schema.NullOr(NonEmptyString);
const NullableDate = Schema.NullOr(IsoDate);
const NullableTimestamp = Schema.NullOr(UtcTimestamp);
const NullableHash = Schema.NullOr(Sha256);

export const LifecycleRecord = Schema.Struct({
  provider: Provider,
  platform: Platform,
  source_id: SourceId,
  model_id: NonEmptyString,
  canonical_model_id: NullableString,
  regions: Schema.Array(NonEmptyString),
  status: LifecycleStatus,
  announcement_date: NullableDate,
  deprecation_date: NullableDate,
  shutdown_date: NullableDate,
  replacement_models: Schema.Array(NonEmptyString),
  source_url: HttpUrl,
  observed_at: UtcTimestamp,
  content_hash: Sha256,
  raw_status: NullableString,
}).pipe(
  Schema.refine(
    (record): record is typeof record =>
      !record.deprecation_date ||
      !record.shutdown_date ||
      record.deprecation_date <= record.shutdown_date,
    { expected: "deprecation_date to be on or before shutdown_date" },
  ),
);

export const SourceStatus = Schema.Struct({
  source_id: SourceId,
  provider: Provider,
  platform: Platform,
  status: SourceHealth,
  record_count: NonNegativeInteger,
  content_hash: NullableHash,
  last_successful_observation_at: NullableTimestamp,
  error_code: NullableString,
});

export const CurrentDataset = Schema.Struct({
  schema_version: Schema.Literal(1),
  last_published_at: NullableTimestamp,
  records: Schema.Array(LifecycleRecord),
  source_status: Schema.Array(SourceStatus),
});

export const ChangeKind = Schema.Literals([
  "added",
  "status_changed",
  "dates_changed",
  "replacements_changed",
  "removed",
]);

export const ChangeField = Schema.Literals([
  "status",
  "announcement_date",
  "deprecation_date",
  "shutdown_date",
  "replacement_models",
]);

export const ChangeValue = Schema.Union([
  Schema.Null,
  NonEmptyString,
  Schema.Array(NonEmptyString),
]);

export const ChangeDetail = Schema.Struct({
  field: ChangeField,
  before: ChangeValue,
  after: ChangeValue,
});

export const ChangeEvent = Schema.Struct({
  id: Sha256,
  published_at: UtcTimestamp,
  kind: ChangeKind,
  identity: NonEmptyString,
  source_id: SourceId,
  provider: Provider,
  platform: Platform,
  model_id: NonEmptyString,
  changes: Schema.Array(ChangeDetail),
});

export const ChangeHistory = Schema.Struct({
  schema_version: Schema.Literal(1),
  events: Schema.Array(ChangeEvent),
});

export const SourceStatusDataset = Schema.Struct({
  schema_version: Schema.Literal(1),
  last_published_at: NullableTimestamp,
  sources: Schema.Array(SourceStatus),
});

export const SourceCheck = Schema.Struct({
  source_id: SourceId,
  provider: Provider,
  platform: Platform,
  label: NonEmptyString,
  scope: NonEmptyString,
  source_url: HttpUrl,
  outcome: CheckOutcome,
  checked_at: NullableTimestamp,
  last_successful_check_at: NullableTimestamp,
  error_code: NullableString,
});

export const CheckStatusDataset = Schema.Struct({
  schema_version: Schema.Literal(1),
  last_checked_at: NullableTimestamp,
  status: CheckStatus,
  sources: Schema.Array(SourceCheck),
});

export type SourceId = Schema.Schema.Type<typeof SourceId>;
export type Provider = Schema.Schema.Type<typeof Provider>;
export type Platform = Schema.Schema.Type<typeof Platform>;
export type LifecycleStatus = Schema.Schema.Type<typeof LifecycleStatus>;
export type SourceHealth = Schema.Schema.Type<typeof SourceHealth>;
export type CheckStatus = Schema.Schema.Type<typeof CheckStatus>;
export type CheckOutcome = Schema.Schema.Type<typeof CheckOutcome>;
export type LifecycleRecord = Schema.Schema.Type<typeof LifecycleRecord>;
export type SourceStatus = Schema.Schema.Type<typeof SourceStatus>;
export type CurrentDataset = Schema.Schema.Type<typeof CurrentDataset>;
export type ChangeKind = Schema.Schema.Type<typeof ChangeKind>;
export type ChangeField = Schema.Schema.Type<typeof ChangeField>;
export type ChangeValue = Schema.Schema.Type<typeof ChangeValue>;
export type ChangeDetail = Schema.Schema.Type<typeof ChangeDetail>;
export type ChangeEvent = Schema.Schema.Type<typeof ChangeEvent>;
export type ChangeHistory = Schema.Schema.Type<typeof ChangeHistory>;
export type SourceStatusDataset = Schema.Schema.Type<
  typeof SourceStatusDataset
>;
export type SourceCheck = Schema.Schema.Type<typeof SourceCheck>;
export type CheckStatusDataset = Schema.Schema.Type<typeof CheckStatusDataset>;
