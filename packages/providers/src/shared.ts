import { Effect } from "effect";
import {
  recordIdentity,
  effectiveLifecycleStatus,
  semanticRecord,
  sha256,
  type LifecycleRecord,
  type LifecycleStatus,
} from "@duskline/lifecycle";
import {
  SourceFailure,
  type SourceDefinition,
  type SourceSuccess,
} from "./types";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const isoDate = (year: number, month: number, day: number): string | null => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
};

export const parseDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim();
  const iso = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const monthFirst = normalized.match(
    /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/,
  );
  if (monthFirst) {
    const month = MONTHS[monthFirst[1]!.toLowerCase()];
    if (month)
      return isoDate(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }

  const dayFirst = normalized.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b/);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2]!.toLowerCase()];
    if (month) return isoDate(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }

  return null;
};

export const lifecycleStatus = (value: string): LifecycleStatus => {
  const normalized = value.toLowerCase();
  if (/remov|delete/.test(normalized)) return "removed";
  if (/retir|end.of.life|eol|shutdown/.test(normalized)) return "retired";
  if (/deprecat/.test(normalized)) return "deprecated";
  if (/legacy/.test(normalized)) return "legacy";
  return "unknown";
};

export const modelTokens = (value: string): Array<string> =>
  value
    .split(/\n|→|->|\s+and\s+/i)
    .map((token) => token.trim().replace(/^[-–—]\s*/, ""))
    .filter(
      (token) =>
        token.length > 1 &&
        token.length < 160 &&
        !/^(none|n\/a|no replacement)$/i.test(token),
    );

export const makeRecord = (
  input: Omit<LifecycleRecord, "content_hash">,
): LifecycleRecord => ({
  ...input,
  content_hash: "",
});

export const finalizeRecords = (
  source: SourceDefinition,
  records: ReadonlyArray<LifecycleRecord>,
  options: {
    readonly allowEmpty?: boolean;
    readonly observedAt?: string;
  } = {},
): Effect.Effect<SourceSuccess, SourceFailure> =>
  Effect.tryPromise({
    try: async () => {
      if (records.length === 0 && !options.allowEmpty) {
        throw new Error("source produced no explicit lifecycle records");
      }
      if (records.length === 0 && !options.observedAt) {
        throw new Error("an empty source result requires an observation time");
      }
      const normalizedRecords = records.map((record) => ({
        ...record,
        status: effectiveLifecycleStatus(
          record,
          record.observed_at.slice(0, 10),
        ),
      }));
      const priority: Record<LifecycleStatus, number> = {
        unknown: 0,
        legacy: 1,
        deprecated: 2,
        retired: 3,
        removed: 4,
      };
      const deduplicated = new Map<string, LifecycleRecord>();
      for (const record of normalizedRecords) {
        const identity = recordIdentity(record);
        const previous = deduplicated.get(identity);
        if (!previous) {
          deduplicated.set(identity, record);
          continue;
        }
        deduplicated.set(identity, {
          ...previous,
          status:
            priority[record.status] > priority[previous.status]
              ? record.status
              : previous.status,
          announcement_date:
            record.announcement_date ?? previous.announcement_date,
          deprecation_date:
            record.deprecation_date ?? previous.deprecation_date,
          shutdown_date: record.shutdown_date ?? previous.shutdown_date,
          replacement_models: [
            ...new Set([
              ...previous.replacement_models,
              ...record.replacement_models,
            ]),
          ],
          raw_status: record.raw_status ?? previous.raw_status,
        });
      }
      const withHashes = await Promise.all(
        [...deduplicated.values()].map(async (record) => ({
          ...record,
          content_hash: await sha256(semanticRecord(record)),
        })),
      );
      withHashes.sort((left, right) =>
        recordIdentity(left).localeCompare(recordIdentity(right), "en"),
      );
      const observedAt = withHashes[0]?.observed_at ?? options.observedAt;
      if (!observedAt) {
        throw new Error("source result requires an observation time");
      }
      return {
        _tag: "SourceSuccess" as const,
        source,
        records: withHashes,
        contentHash: await sha256(withHashes.map(semanticRecord)),
        observedAt,
      };
    },
    catch: (error) =>
      new SourceFailure({
        source_id: source.id,
        code: "invalid_source_result",
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      }),
  });

export const fetchText = (
  source: SourceDefinition,
  init?: RequestInit,
): Effect.Effect<string, SourceFailure> =>
  Effect.tryPromise({
    try: async () => {
      let lastError: Error | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const timeout = AbortSignal.timeout(15_000);
        const signal = init?.signal
          ? AbortSignal.any([init.signal, timeout])
          : timeout;
        try {
          const response = await fetch(source.url, {
            ...init,
            signal,
            headers: {
              accept: "text/html,application/json",
              "user-agent": "duskline-lifecycle-collector/1.0",
              ...init?.headers,
            },
          });
          if (response.ok) return response.text();
          lastError = new Error(`HTTP ${response.status}`);
          if (response.status !== 429 && response.status < 500) break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 250 * 2 ** attempt),
          );
        }
      }
      throw lastError ?? new Error("request failed");
    },
    catch: (error) =>
      new SourceFailure({
        source_id: source.id,
        code: "fetch_failed",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      }),
  });
