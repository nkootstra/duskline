import { describe, expect, it } from "vitest";
import type {
  ChangeHistory,
  CheckStatusDataset,
  CurrentDataset,
  LifecycleRecord,
} from "@duskline/lifecycle";
import { buildLifecycleEntries } from "@duskline/lifecycle";
import {
  buildLifecycleEntryIndex,
  buildModelPassport,
  buildModelPassportByKey,
  buildSourceCoverage,
  verificationSummary,
} from "../src/lib/trust-data";

const observedAt = "2026-07-25T04:17:00.000Z";
const sourceUrl = "https://developers.openai.com/api/docs/deprecations";
const record: LifecycleRecord = {
  provider: "openai",
  platform: "direct",
  source_id: "openai-lifecycle",
  model_id: "gpt-5.2-codex",
  canonical_model_id: null,
  regions: [],
  status: "deprecated",
  announcement_date: "2026-06-20",
  deprecation_date: "2026-07-01",
  shutdown_date: "2026-07-23",
  replacement_models: ["gpt-5.6-sol"],
  source_url: sourceUrl,
  observed_at: observedAt,
  content_hash: "a".repeat(64),
  raw_status: null,
};
const current: CurrentDataset = {
  schema_version: 1,
  last_published_at: "2026-07-24T19:10:15.019Z",
  records: [record],
  source_status: [
    {
      source_id: "openai-lifecycle",
      provider: "openai",
      platform: "direct",
      status: "healthy",
      record_count: 1,
      content_hash: "b".repeat(64),
      last_successful_observation_at: observedAt,
      error_code: null,
    },
  ],
};
const checks: CheckStatusDataset = {
  schema_version: 1,
  last_checked_at: observedAt,
  status: "healthy",
  sources: [
    {
      source_id: "openai-lifecycle",
      provider: "openai",
      platform: "direct",
      label: "OpenAI lifecycle",
      scope: "Direct API lifecycle.",
      source_url: sourceUrl,
      outcome: "success",
      checked_at: observedAt,
      last_successful_check_at: observedAt,
      error_code: null,
    },
  ],
};
const history: ChangeHistory = {
  schema_version: 1,
  events: [
    {
      id: "c".repeat(64),
      published_at: "2026-07-24T19:10:15.019Z",
      kind: "replacements_changed",
      identity: "openai-lifecycle:openai:direct:gpt-5.2-codex:",
      source_id: "openai-lifecycle",
      provider: "openai",
      platform: "direct",
      model_id: "gpt-5.2-codex",
      changes: [
        {
          field: "replacement_models",
          before: [],
          after: ["gpt-5.6-sol"],
        },
      ],
    },
  ],
};

describe("trust data", () => {
  it("summarizes healthy and degraded daily checks honestly", () => {
    expect(
      verificationSummary(checks, current.last_published_at, "2026-07-25"),
    ).toMatchObject({
      tone: "neutral",
      label:
        "Verified against 1 official source today · Lifecycle facts last changed Jul 24, 2026",
    });
    expect(
      verificationSummary(
        {
          ...checks,
          status: "degraded",
          sources: [
            {
              ...checks.sources[0]!,
              outcome: "failure",
              error_code: "fetch_failed",
            },
          ],
        },
        current.last_published_at,
        "2026-07-25",
      ),
    ).toMatchObject({
      tone: "warning",
      label:
        "Checked today · 0 of 1 sources verified · Last trusted facts retained",
    });
  });

  it("builds compact source coverage including valid zero-record sources", () => {
    const rows = buildSourceCoverage(
      {
        ...checks,
        sources: [
          checks.sources[0]!,
          {
            ...checks.sources[0]!,
            source_id: "fireworks-changelog",
            provider: "fireworks",
            platform: "fireworks_serverless",
            label: "Fireworks changelog",
            scope: "Official serverless deprecation announcements.",
            source_url: "https://docs.fireworks.ai/updates/changelog",
          },
        ],
      },
      {
        ...current,
        source_status: [
          current.source_status[0]!,
          {
            source_id: "fireworks-changelog",
            provider: "fireworks",
            platform: "fireworks_serverless",
            status: "healthy",
            record_count: 0,
            content_hash: "d".repeat(64),
            last_successful_observation_at: observedAt,
            error_code: null,
          },
        ],
      },
    );

    expect(rows[1]).toMatchObject({
      sourceId: "fireworks-changelog",
      recordCount: 0,
      outcome: "success",
    });
  });

  it("builds a compact passport with exact replacements and history", () => {
    const passport = buildModelPassport(
      "openai-lifecycle:openai:direct:gpt-5.2-codex:",
      current,
      history,
      checks,
      "2026-07-25",
    );

    expect(passport).toMatchObject({
      entry: {
        model_id: "gpt-5.2-codex",
        status: "retired",
        replacement_models: ["gpt-5.6-sol"],
      },
      evidence: [
        {
          label: "OpenAI lifecycle",
          sourceUrl,
          outcome: "success",
        },
      ],
    });
    expect(passport?.entry).not.toHaveProperty("record_identities");
    expect(passport?.evidence[0]).not.toHaveProperty("lastSuccessfulCheckAt");
    expect(passport?.history).toHaveLength(1);
  });

  it("reuses a keyed lifecycle index for passport lookup", async () => {
    const entries = buildLifecycleEntries(current.records, "2026-07-25");
    const index = await buildLifecycleEntryIndex(entries);
    const key = index.keyByIdentity.get(entries[0]!.identity);

    expect(key).toMatch(/^[a-f0-9]{64}$/u);
    await expect(
      buildModelPassportByKey(
        key!,
        current,
        history,
        checks,
        "2026-07-25",
        index,
      ),
    ).resolves.toMatchObject({
      entry: { model_id: "gpt-5.2-codex" },
    });
    await expect(
      buildModelPassportByKey(
        "not-a-valid-key",
        current,
        history,
        checks,
        "2026-07-25",
        index,
      ),
    ).resolves.toBeNull();
  });
});
