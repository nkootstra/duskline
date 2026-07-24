import { describe, expect, it } from "vitest";
import {
  buildLifecycleNotices,
  effectiveLifecycleStatus,
  type LifecycleRecord,
} from "../src";

const record = (
  sourceId: LifecycleRecord["source_id"],
  shutdownDate: string,
  overrides: Partial<LifecycleRecord> = {},
): LifecycleRecord => ({
  provider: "fireworks",
  platform: "fireworks_serverless",
  source_id: sourceId,
  model_id: "accounts/fireworks/models/example",
  canonical_model_id: null,
  regions: [],
  status: "deprecated",
  announcement_date: null,
  deprecation_date: "2026-07-01",
  shutdown_date: shutdownDate,
  replacement_models: [],
  source_url: "https://docs.fireworks.ai/updates/changelog",
  observed_at: "2026-07-24T00:00:00.000Z",
  content_hash: "a".repeat(64),
  raw_status: null,
  ...overrides,
});

describe("canonical lifecycle projection", () => {
  it("derives retirement from the requested date", () => {
    const lifecycle = record("fireworks-models", "2026-08-01");
    expect(effectiveLifecycleStatus(lifecycle, "2026-07-31")).toBe(
      "deprecated",
    );
    expect(effectiveLifecycleStatus(lifecycle, "2026-08-02")).toBe("retired");
  });

  it("keeps the previous 30 days of deletions and removes older ones", () => {
    const notices = buildLifecycleNotices(
      [
        record("fireworks-models", "2026-07-23", {
          model_id: "recently-deleted",
        }),
        record("fireworks-models", "2026-06-23", {
          model_id: "older-deletion",
        }),
      ],
      "2026-07-24",
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      model_id: "recently-deleted",
      status: "retired",
      days_until_deletion: -1,
    });
  });

  it("sorts recent past deletions before upcoming deletions", () => {
    const notices = buildLifecycleNotices(
      [
        record("fireworks-models", "2026-07-23", {
          model_id: "recently-deleted",
        }),
        record("fireworks-models", "2026-07-25", {
          model_id: "upcoming-deletion",
        }),
      ],
      "2026-07-24",
    );
    expect(notices.map((notice) => notice.model_id)).toEqual([
      "recently-deleted",
      "upcoming-deletion",
    ]);
  });

  it("reconciles overlapping source observations into one notice", () => {
    const notices = buildLifecycleNotices(
      [
        record("fireworks-models", "2026-08-05", {
          canonical_model_id: "accounts/fireworks/models/example",
          source_url: "https://api.fireworks.ai/inference/v1/models",
        }),
        record("fireworks-changelog", "2026-08-01", {
          canonical_model_id: "accounts/fireworks/models/example",
          replacement_models: ["replacement"],
        }),
      ],
      "2026-07-24",
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      shutdown_date: "2026-08-01",
      replacement_models: ["replacement"],
      days_until_deletion: 8,
      urgency: "warning",
    });
    expect(notices[0]?.sources).toHaveLength(2);
  });

  it("omits unknown deletion dates and deduplicates source links", () => {
    const notices = buildLifecycleNotices(
      [
        record("fireworks-models", "2026-08-01", {
          canonical_model_id: "accounts/fireworks/models/example",
        }),
        record("fireworks-models", "2026-08-01", {
          model_id: "accounts/fireworks/models/example:free",
          canonical_model_id: "accounts/fireworks/models/example",
        }),
        record("fireworks-changelog", "2026-08-01", {
          model_id: "unknown-deletion",
          shutdown_date: null,
        }),
      ],
      "2026-07-24",
    );
    expect(notices).toHaveLength(1);
    expect(
      notices.some((notice) => notice.model_id === "unknown-deletion"),
    ).toBe(false);
    expect(notices[0]?.sources).toHaveLength(1);
  });
});
