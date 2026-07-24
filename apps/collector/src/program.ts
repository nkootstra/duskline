import { Effect } from "effect";
import { SOURCE_REGISTRY } from "@duskline/providers";
import { mergeCollection } from "./collect";
import { readArtifacts, writeArtifacts } from "./io";

export const collectionProgram = Effect.gen(function* () {
  const observedAt = new Date().toISOString();
  const fireworksApiKey = process.env.FIREWORKS_API_KEY;
  const fireworksAccountId = process.env.FIREWORKS_ACCOUNT_ID;
  const context = {
    observedAt,
    ...(fireworksApiKey ? { fireworksApiKey } : {}),
    ...(fireworksAccountId ? { fireworksAccountId } : {}),
  };
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
    }),
  );
  return output;
});
