import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveLifecycleStatus } from "@duskline/lifecycle";
import {
  parseAnthropic,
  parseBedrock,
  parseFireworksChangelog,
  parseFireworksModels,
  parseOpenAi,
  parseOpenRouter,
} from "../src";

const fixture = (path: string): string =>
  readFileSync(resolve(import.meta.dirname, "../../../fixtures", path), "utf8");
const observedAt = "2026-07-24T00:00:00.000Z";

describe("provider fixtures", () => {
  it("extracts OpenAI lifecycle dates", () => {
    expect(
      parseOpenAi(fixture("openai/deprecations.html"), observedAt)[0],
    ).toMatchObject({
      model_id: "gpt-example",
      shutdown_date: "2026-08-01",
      replacement_models: ["gpt-next"],
    });
  });

  it("keeps Anthropic direct lifecycle distinct", () => {
    expect(
      parseAnthropic(fixture("anthropic/deprecations.html"), observedAt)[0],
    ).toMatchObject({
      platform: "direct",
      status: "deprecated",
      deprecation_date: "2026-01-02",
      shutdown_date: "2026-07-02",
    });
  });

  it("keeps Anthropic models deprecated until their retirement date", () => {
    expect(
      parseAnthropic(
        fixture("anthropic/deprecations.html"),
        "2026-06-01T00:00:00.000Z",
      )[0],
    ).toMatchObject({ status: "deprecated" });
  });

  it("derives retirement from an explicit observation date", () => {
    const record = parseAnthropic(
      fixture("anthropic/deprecations.html"),
      observedAt,
    )[0]!;
    expect(effectiveLifecycleStatus(record, "2026-07-01")).toBe("deprecated");
    expect(effectiveLifecycleStatus(record, "2026-07-24")).toBe("retired");
  });

  it("extracts Bedrock legacy lifecycle", () => {
    expect(
      parseBedrock(fixture("bedrock/lifecycle.html"), observedAt)[0],
    ).toMatchObject({
      platform: "bedrock",
      status: "legacy",
      shutdown_date: "2026-12-01",
    });
  });

  it("keeps Bedrock parsing independent from the wall clock", () => {
    const html = fixture("bedrock/lifecycle.html");
    expect(parseBedrock(html, "2025-01-01T00:00:00.000Z")[0]?.status).toBe(
      "legacy",
    );
    expect(parseBedrock(html, "2027-01-01T00:00:00.000Z")[0]?.status).toBe(
      "legacy",
    );
  });

  it("extracts Fireworks changelog and API lifecycle", () => {
    expect(
      parseFireworksChangelog(fixture("fireworks/changelog.html"), observedAt),
    ).toHaveLength(1);
    expect(
      parseFireworksModels(
        JSON.parse(fixture("fireworks/models.json")),
        observedAt,
      )[0],
    ).toMatchObject({
      model_id: "accounts/fireworks/models/example-v1",
      deprecation_date: "2026-07-05",
      shutdown_date: null,
    });
  });

  it("extracts source-scoped Fireworks notices without API model IDs", () => {
    const records = parseFireworksChangelog(
      `
        <div class="update">
          <time>2026-06-26</time>
          <div class="prose-sm">
            <h1 id="serverless-deprecation-examples">
              Serverless deprecation: Example One and Example Two
            </h1>
            <p>Example One and Example Two are deprecated from serverless.</p>
            <ul>
              <li>Example One — migrate to Example Three</li>
              <li>Example Two — migrate to Example Four</li>
            </ul>
          </div>
        </div>
      `,
      observedAt,
    );
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      deprecation_date: "2026-06-26",
      shutdown_date: null,
      replacement_models: ["Example Three"],
      source_url:
        "https://docs.fireworks.ai/updates/changelog#serverless-deprecation-examples",
    });
  });

  it("extracts a removal date that follows the removal label", () => {
    const records = parseFireworksChangelog(
      `
        <div class="update">
          <time>May 14, 2026</time>
          <div class="prose-sm">
            <h1>Serverless deprecation: Legacy models removed May 14, 2026</h1>
            <ul>
              <li>Example One — migrate to Example Two</li>
            </ul>
          </div>
        </div>
      `,
      observedAt,
    );
    expect(records[0]).toMatchObject({
      model_id: "Example One",
      deprecation_date: "2026-05-14",
      shutdown_date: "2026-05-14",
    });
  });

  it("retains only OpenRouter entries with expiration dates", () => {
    const records = parseOpenRouter(
      JSON.parse(fixture("openrouter/models.json")),
      observedAt,
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      model_id: "vendor/example",
      shutdown_date: "2026-09-01",
    });
  });

  it("fails closed when HTML structure disappears", () => {
    expect(parseOpenAi("<main>no lifecycle table</main>", observedAt)).toEqual(
      [],
    );
  });
});
