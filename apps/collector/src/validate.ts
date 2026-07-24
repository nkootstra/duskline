import { BunRuntime } from "@effect/platform-bun";
import { Effect, Schema } from "effect";
import {
  ChangeHistory,
  CurrentDataset,
  SourceStatusDataset,
  assertDatasetIntegrity,
  stableJson,
} from "@duskline/lifecycle";

const validate = Effect.tryPromise({
  try: async () => {
    const root = new URL("../../../data/", import.meta.url);
    const current = Schema.decodeUnknownSync(CurrentDataset)(
      await Bun.file(new URL("current.json", root)).json(),
    );
    assertDatasetIntegrity(current);
    Schema.decodeUnknownSync(ChangeHistory)(
      await Bun.file(new URL("changes.json", root)).json(),
    );
    const status = Schema.decodeUnknownSync(SourceStatusDataset)(
      await Bun.file(new URL("source-status.json", root)).json(),
    );
    if (
      status.last_published_at !== current.last_published_at ||
      stableJson(status.sources) !== stableJson(current.source_status)
    ) {
      throw new Error("source-status.json does not match current.json");
    }
  },
  catch: (error) =>
    new Error(
      `Artifact validation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ),
});

BunRuntime.runMain(validate);
