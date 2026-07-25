import { Effect } from "effect";
import { SOURCE_REGISTRY } from "@duskline/providers";
import { buildCheckStatus, mergeCollection } from "./collect";
import { readArtifacts, writeArtifacts, writeCheckStatus } from "./io";

export const collectionProgram = Effect.gen(function* () {
  const observedAt = new Date().toISOString();
  const context = { observedAt };
  const collectors = SOURCE_REGISTRY.map(({ collect }) => collect(context));
  const [failures, successes] = yield* Effect.partition(
    collectors,
    (collector) => collector,
    { concurrency: 3 },
  );
  const previous = yield* readArtifacts;
  const output = yield* Effect.promise(() =>
    mergeCollection(
      previous.current,
      previous.changes,
      SOURCE_REGISTRY.map(({ source }) => source),
      successes,
      failures,
      observedAt,
    ),
  );
  if (output.changed) {
    yield* writeArtifacts(output.current, output.changes);
  }
  const checkedAt = new Date().toISOString();
  const checks = buildCheckStatus(
    previous.checks,
    SOURCE_REGISTRY.map(({ source }) => source),
    successes,
    failures,
    checkedAt,
  );
  yield* writeCheckStatus(checks);
  yield* Effect.logInfo(
    JSON.stringify({
      changed: output.changed,
      degraded: output.degraded,
      successful_sources: successes.length,
      failed_sources: failures.map((failure) => ({
        source_id: failure.source_id,
        code: failure.code,
      })),
      record_count: output.current.records.length,
      checked_at: checks.last_checked_at,
    }),
  );
  return output;
});
