import { Effect, Schema } from "effect";
import { fetchText, finalizeRecords, makeRecord, parseDate } from "./shared";
import {
  SourceFailure,
  type CollectContext,
  type SourceDefinition,
} from "./types";

export const OPENROUTER_SOURCE: SourceDefinition = {
  id: "openrouter-models",
  provider: "openrouter",
  platform: "openrouter",
  url: "https://openrouter.ai/api/v1/models?output_modalities=all",
};

const OpenRouterModel = Schema.Struct({
  id: Schema.String,
  canonical_slug: Schema.NullOr(Schema.String),
  expiration_date: Schema.NullOr(Schema.String),
});
const OpenRouterResponse = Schema.Struct({
  data: Schema.Array(OpenRouterModel),
});

export const parseOpenRouter = (json: unknown, observedAt: string) =>
  Schema.decodeUnknownSync(OpenRouterResponse)(json)
    .data.filter((model) => model.expiration_date !== null)
    .map((model) =>
      makeRecord({
        provider: "openrouter",
        platform: "openrouter",
        source_id: OPENROUTER_SOURCE.id,
        model_id: model.id,
        canonical_model_id: model.canonical_slug,
        regions: [],
        status: "deprecated",
        announcement_date: null,
        deprecation_date: null,
        shutdown_date: parseDate(model.expiration_date),
        replacement_models: [],
        source_url: OPENROUTER_SOURCE.url,
        observed_at: observedAt,
        raw_status: "expiration scheduled",
      }),
    );

export const collectOpenRouter = (context: CollectContext) =>
  Effect.flatMap(
    fetchText(OPENROUTER_SOURCE, { signal: context.signal ?? null }),
    (text) =>
      Effect.try({
        try: () =>
          parseOpenRouter(JSON.parse(text) as unknown, context.observedAt),
        catch: (error) =>
          new SourceFailure({
            source_id: OPENROUTER_SOURCE.id,
            code: "malformed_json",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          }),
      }).pipe(
        Effect.flatMap((records) =>
          finalizeRecords(OPENROUTER_SOURCE, records),
        ),
      ),
  );
