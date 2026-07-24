import { Effect, Schema } from "effect";
import {
  ChangeHistory,
  CurrentDataset,
  assertDatasetIntegrity,
  canonicalizeSourceStatus,
  stableJson,
  type SourceStatusDataset,
} from "@duskline/lifecycle";

const dataPath = (name: string): string =>
  new URL(`../../../data/${name}`, import.meta.url).pathname;

export const readArtifacts = Effect.tryPromise({
  try: async () => {
    const [current, changes] = await Promise.all([
      Bun.file(dataPath("current.json")).json(),
      Bun.file(dataPath("changes.json")).json(),
    ]);
    const decodedCurrent = Schema.decodeUnknownSync(CurrentDataset)(current);
    assertDatasetIntegrity(decodedCurrent);
    return {
      current: decodedCurrent,
      changes: Schema.decodeUnknownSync(ChangeHistory)(changes),
    };
  },
  catch: (error) =>
    new Error(
      `Unable to read generated artifacts: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ),
});

export const writeArtifacts = (
  current: Schema.Schema.Type<typeof CurrentDataset>,
  changes: Schema.Schema.Type<typeof ChangeHistory>,
) =>
  Effect.tryPromise({
    try: async () => {
      const status: SourceStatusDataset = canonicalizeSourceStatus({
        schema_version: 1,
        last_published_at: current.last_published_at,
        sources: current.source_status,
      });
      await Promise.all([
        Bun.write(dataPath("current.json"), stableJson(current)),
        Bun.write(dataPath("changes.json"), stableJson(changes)),
        Bun.write(dataPath("source-status.json"), stableJson(status)),
      ]);
    },
    catch: (error) =>
      new Error(
        `Unable to write generated artifacts: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
  });
