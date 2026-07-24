import { describe, expect, it } from "vitest";
import {
  canonicalizeCurrent,
  semanticRecord,
  sha256,
  type ChangeHistory,
  type CurrentDataset,
  type LifecycleRecord,
} from "@duskline/lifecycle";
import {
  OPENAI_SOURCE,
  SourceFailure,
  type SourceSuccess,
} from "@duskline/providers";
import { mergeCollection } from "../src/collect";

const publishedAt = "2026-07-24T10:00:00.000Z";
const hash = "a".repeat(64);
const history: ChangeHistory = { schema_version: 1, events: [] };
const record = async (): Promise<LifecycleRecord> => {
  const value: LifecycleRecord = {
    provider: "openai",
    platform: "direct",
    source_id: "openai-lifecycle",
    model_id: "gpt-example",
    canonical_model_id: null,
    regions: [],
    status: "deprecated",
    announcement_date: null,
    deprecation_date: "2026-01-01",
    shutdown_date: "2026-08-01",
    replacement_models: ["gpt-next"],
    source_url: OPENAI_SOURCE.url,
    observed_at: publishedAt,
    content_hash: "",
    raw_status: null,
  };
  return { ...value, content_hash: await sha256(semanticRecord(value)) };
};

const seed = (): CurrentDataset =>
  canonicalizeCurrent({
    schema_version: 1,
    last_published_at: null,
    records: [],
    source_status: [
      {
        source_id: "openai-lifecycle",
        provider: "openai",
        platform: "direct",
        status: "not_collected",
        record_count: 0,
        content_hash: null,
        last_successful_observation_at: null,
        error_code: null,
      },
    ],
  });

describe("collection merge", () => {
  it("adds a lifecycle record and one change event", async () => {
    const lifecycle = await record();
    const success: SourceSuccess = {
      _tag: "SourceSuccess",
      source: OPENAI_SOURCE,
      records: [lifecycle],
      contentHash: hash,
      observedAt: publishedAt,
    };
    const output = await mergeCollection(
      seed(),
      history,
      [OPENAI_SOURCE],
      [success],
      [],
      publishedAt,
    );
    expect(output.changed).toBe(true);
    expect(output.current.records).toHaveLength(1);
    expect(output.changes.events).toHaveLength(1);
    expect(output.changes.events[0]?.kind).toBe("added");
    expect(output.changes.events[0]?.changes).toEqual([
      { field: "status", before: null, after: "deprecated" },
      { field: "deprecation_date", before: null, after: "2026-01-01" },
      { field: "shutdown_date", before: null, after: "2026-08-01" },
      { field: "replacement_models", before: null, after: ["gpt-next"] },
    ]);
  });

  it("publishes a registered source without requiring a seeded status", async () => {
    const lifecycle = await record();
    const output = await mergeCollection(
      {
        schema_version: 1,
        last_published_at: null,
        records: [],
        source_status: [],
      },
      history,
      [OPENAI_SOURCE],
      [
        {
          _tag: "SourceSuccess",
          source: OPENAI_SOURCE,
          records: [lifecycle],
          contentHash: hash,
          observedAt: publishedAt,
        },
      ],
      [],
      publishedAt,
    );
    expect(output.current.records).toEqual([lifecycle]);
    expect(output.current.source_status[0]).toMatchObject({
      source_id: OPENAI_SOURCE.id,
      status: "healthy",
      record_count: 1,
    });
  });

  it("preserves the prior source on failure", async () => {
    const lifecycle = await record();
    const base = seed();
    const previous: CurrentDataset = {
      ...base,
      records: [lifecycle],
      source_status: [
        {
          ...base.source_status[0]!,
          status: "healthy",
          record_count: 1,
          content_hash: hash,
          last_successful_observation_at: publishedAt,
        },
      ],
    };
    const output = await mergeCollection(
      previous,
      history,
      [OPENAI_SOURCE],
      [],
      [
        new SourceFailure({
          source_id: "openai-lifecycle",
          code: "fetch_failed",
          message: "HTTP 500",
          retryable: true,
        }),
      ],
      "2026-07-25T10:00:00.000Z",
    );
    expect(output.current.records).toEqual([lifecycle]);
    expect(output.current.source_status[0]?.status).toBe("stale");
    expect(output.degraded).toBe(true);
  });

  it("does not publish unchanged data", async () => {
    const lifecycle = await record();
    const base = seed();
    const previous: CurrentDataset = {
      ...base,
      records: [lifecycle],
      last_published_at: publishedAt,
      source_status: [
        {
          ...base.source_status[0]!,
          status: "healthy",
          record_count: 1,
          content_hash: hash,
          last_successful_observation_at: publishedAt,
        },
      ],
    };
    const success: SourceSuccess = {
      _tag: "SourceSuccess",
      source: OPENAI_SOURCE,
      records: [{ ...lifecycle, observed_at: "2026-07-25T10:00:00.000Z" }],
      contentHash: hash,
      observedAt: "2026-07-25T10:00:00.000Z",
    };
    const output = await mergeCollection(
      previous,
      history,
      [OPENAI_SOURCE],
      [success],
      [],
      "2026-07-25T10:00:00.000Z",
    );
    expect(output.changed).toBe(false);
    expect(output.current.last_published_at).toBe(publishedAt);
    expect(output.current.records[0]?.observed_at).toBe(publishedAt);
  });
});
