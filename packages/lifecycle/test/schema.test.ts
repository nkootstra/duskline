import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import {
  CurrentDataset,
  assertDatasetIntegrity,
  canonicalizeCurrent,
  recordIdentity,
  stableJson,
  type LifecycleRecord,
} from "../src";

const hash = "a".repeat(64);

const completeRecord: LifecycleRecord = {
  provider: "openai",
  platform: "direct",
  source_id: "openai-lifecycle",
  model_id: "gpt-example",
  canonical_model_id: null,
  regions: ["us", "eu", "us"],
  status: "deprecated",
  announcement_date: "2026-01-01",
  deprecation_date: "2026-02-01",
  shutdown_date: "2026-08-01",
  replacement_models: ["gpt-next", "gpt-next"],
  source_url: "https://example.com/lifecycle",
  observed_at: "2026-07-24T00:00:00.000Z",
  content_hash: hash,
  raw_status: null,
};

describe("lifecycle contract", () => {
  it("validates nullable dates and produces stable ordering", () => {
    const dataset = canonicalizeCurrent({
      schema_version: 1,
      last_published_at: null,
      records: [completeRecord],
      source_status: [
        {
          source_id: "openai-lifecycle",
          provider: "openai",
          platform: "direct",
          status: "healthy",
          record_count: 1,
          content_hash: hash,
          last_successful_observation_at: completeRecord.observed_at,
          error_code: null,
        },
      ],
    });

    expect(Schema.decodeUnknownSync(CurrentDataset)(dataset)).toEqual(dataset);
    expect(dataset.records[0]?.regions).toEqual(["eu", "us"]);
    expect(stableJson(dataset)).toBe(stableJson(canonicalizeCurrent(dataset)));
    expect(() => assertDatasetIntegrity(dataset)).not.toThrow();
  });

  it("rejects a record without a model id", () => {
    expect(() =>
      Schema.decodeUnknownSync(CurrentDataset)({
        schema_version: 1,
        last_published_at: null,
        records: [{ ...completeRecord, model_id: undefined }],
        source_status: [],
      }),
    ).toThrow();
  });

  it("keeps platform identity distinct", () => {
    expect(recordIdentity(completeRecord)).not.toEqual(
      recordIdentity({ ...completeRecord, platform: "openrouter" }),
    );
  });

  it("rejects malformed lifecycle values at the artifact boundary", () => {
    expect(() =>
      Schema.decodeUnknownSync(CurrentDataset)({
        schema_version: 1,
        last_published_at: "not-a-timestamp",
        records: [
          {
            ...completeRecord,
            model_id: "",
            shutdown_date: "2026-99-99",
            source_url: "not-a-url",
          },
        ],
        source_status: [],
      }),
    ).toThrow();
  });
});
