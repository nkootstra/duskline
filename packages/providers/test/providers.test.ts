import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { effectiveLifecycleStatus } from "@duskline/lifecycle";
import {
  collectOpenAi,
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
  it("extracts current OpenAI lifecycle records", () => {
    const records = parseOpenAi(
      fixture("openai/deprecations.html"),
      observedAt,
    );

    expect(
      records.find((record) => record.model_id === "gpt-example"),
    ).toMatchObject({
      model_id: "gpt-example",
      announcement_date: "2026-06-01",
      shutdown_date: "2026-08-01",
      replacement_models: ["gpt-next"],
    });
    expect(
      records.find((record) => record.model_id === "gpt-5.2-codex"),
    ).toMatchObject({
      announcement_date: "2026-04-22",
      shutdown_date: "2026-07-23",
      replacement_models: ["gpt-5.6-sol"],
    });
  });

  it("keeps only model replacements from OpenAI cells", () => {
    const records = parseOpenAi(
      fixture("openai/deprecations.html"),
      observedAt,
    );

    expect(
      records.find((record) => record.model_id === "gpt-pro-example"),
    ).toMatchObject({
      replacement_models: ["gpt-next"],
    });
    expect(
      records.find((record) => record.model_id === "sora-2"),
    ).toMatchObject({
      replacement_models: [],
    });
    expect(records.some((record) => record.model_id === "Videos API")).toBe(
      false,
    );
    expect(
      records.some((record) => record.model_id.startsWith("OpenAI-Beta:")),
    ).toBe(false);
    expect(records.some((record) => record.model_id.startsWith("/"))).toBe(
      false,
    );
  });

  it("uses the newest OpenAI announcement for duplicate models", () => {
    const records = parseOpenAi(
      fixture("openai/deprecations.html"),
      observedAt,
    );
    const duplicate = records.filter(
      (record) => record.model_id === "gpt-4-1106-preview",
    );

    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]).toMatchObject({
      announcement_date: "2026-04-22",
      shutdown_date: "2026-10-23",
      replacement_models: ["gpt-5.6-sol"],
    });
  });

  it("combines replacement choices within one OpenAI announcement", () => {
    expect(
      parseOpenAi(fixture("openai/deprecations.html"), observedAt).find(
        (record) => record.model_id === "gpt-multi-example",
      ),
    ).toMatchObject({
      shutdown_date: "2026-08-03",
      replacement_models: ["gpt-next", "gpt-next-mini"],
    });
  });

  it("normalizes Unicode separators in OpenAI lifecycle dates", () => {
    expect(
      parseOpenAi(fixture("openai/deprecations.html"), observedAt).find(
        (record) => record.model_id === "gpt-4-0125-preview",
      ),
    ).toMatchObject({
      shutdown_date: "2026-03-26",
    });
  });

  it("fails closed for an unknown OpenAI replacement column", () => {
    expect(() =>
      parseOpenAi(
        `
          <h3>2026-07-24: Changed lifecycle table</h3>
          <div>
            <table>
              <thead>
                <tr>
                  <th>Shutdown date</th>
                  <th>Model</th>
                  <th>Migration target</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>2026-08-01</td>
                  <td><code>gpt-example</code></td>
                  <td><code>gpt-next</code></td>
                </tr>
              </tbody>
            </table>
          </div>
        `,
        observedAt,
      ),
    ).toThrow(/replacement column/i);
  });

  it("fails closed when an OpenAI model replacement cannot be decoded", () => {
    expect(() =>
      parseOpenAi(
        `
          <h3>2026-07-24: Changed replacement format</h3>
          <div>
            <table>
              <thead>
                <tr>
                  <th>Shutdown date</th>
                  <th>Model</th>
                  <th>Recommended replacement</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>2026-08-01</td>
                  <td><code>gpt-example</code></td>
                  <td>See the migration guide</td>
                </tr>
              </tbody>
            </table>
          </div>
        `,
        observedAt,
      ),
    ).toThrow(/could not be decoded/i);
  });

  it("uses the nearest preceding OpenAI heading across heading levels", () => {
    const records = parseOpenAi(
      `
        <h3>2026-01-01: Older announcement</h3>
        <section>
          <h2>2026-07-24: Current announcement</h2>
          <div>
            <table>
              <thead>
                <tr>
                  <th>Shutdown date</th>
                  <th>Model</th>
                  <th>Recommended replacement</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>2026-08-01</td>
                  <td><code>gpt-example</code></td>
                  <td><code>gpt-next</code></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      `,
      observedAt,
    );

    expect(records[0]).toMatchObject({ announcement_date: "2026-07-24" });
  });

  it("fails closed when the nearest OpenAI announcement heading has no date", () => {
    expect(() =>
      parseOpenAi(
        `
          <h3>2026-01-01: Older announcement</h3>
          <section>
            <h2>Current announcement</h2>
            <table>
              <thead>
                <tr>
                  <th>Shutdown date</th>
                  <th>Model</th>
                  <th>Recommended replacement</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>2026-08-01</td>
                  <td><code>gpt-example</code></td>
                  <td><code>gpt-next</code></td>
                </tr>
              </tbody>
            </table>
          </section>
        `,
        observedAt,
      ),
    ).toThrow(/announcement.*could not be parsed/i);
  });

  it("fails closed when an OpenAI announcement heading is missing", () => {
    expect(() =>
      parseOpenAi(
        `
          <table>
            <thead>
              <tr>
                <th>Shutdown date</th>
                <th>Model</th>
                <th>Recommended replacement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2026-08-01</td>
                <td><code>gpt-example</code></td>
                <td><code>gpt-next</code></td>
              </tr>
            </tbody>
          </table>
        `,
        observedAt,
      ),
    ).toThrow(/no dated announcement/i);
  });

  it("fails closed when a non-empty OpenAI shutdown date cannot be parsed", () => {
    expect(() =>
      parseOpenAi(
        `
          <h2>2026-07-24: Changed lifecycle table</h2>
          <table>
            <thead>
              <tr>
                <th>Shutdown date</th>
                <th>Model</th>
                <th>Recommended replacement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>soon</td>
                <td><code>gpt-example</code></td>
                <td><code>gpt-next</code></td>
              </tr>
            </tbody>
          </table>
        `,
        observedAt,
      ),
    ).toThrow(/shutdown date.*could not be parsed/i);
  });

  it("parses OpenAI retirement date tables", () => {
    expect(
      parseOpenAi(
        `
          <h1>2026-07-24: Changed lifecycle table</h1>
          <table>
            <thead>
              <tr>
                <th>Retirement date</th>
                <th>Model</th>
                <th>Recommended replacement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2026-08-01</td>
                <td><code>gpt-example</code></td>
                <td><code>gpt-next</code></td>
              </tr>
            </tbody>
          </table>
        `,
        observedAt,
      )[0],
    ).toMatchObject({ shutdown_date: "2026-08-01" });
  });

  it("fails closed for OpenAI rows missing required indexed cells", () => {
    expect(() =>
      parseOpenAi(
        `
          <h2>2026-07-24: Changed lifecycle table</h2>
          <table>
            <thead>
              <tr>
                <th>Shutdown date</th>
                <th>Model</th>
                <th>Recommended replacement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2026-08-01</td>
                <td><code>gpt-example</code></td>
              </tr>
            </tbody>
          </table>
        `,
        observedAt,
      ),
    ).toThrow(/missing required cells/i);
  });

  it("fails closed when a non-model OpenAI cell cannot be decoded", () => {
    expect(() =>
      parseOpenAi(
        `
          <h2>2026-07-24: Changed lifecycle table</h2>
          <table>
            <thead>
              <tr>
                <th>Shutdown date</th>
                <th>Model</th>
                <th>Recommended replacement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2026-08-01</td>
                <td>See migration guide</td>
                <td><code>gpt-next</code></td>
              </tr>
            </tbody>
          </table>
        `,
        observedAt,
      ),
    ).toThrow(/model cell could not be decoded/i);
  });

  it("skips known OpenAI API rows", () => {
    expect(
      parseOpenAi(
        `
          <h2>2026-07-24: Changed lifecycle table</h2>
          <table>
            <thead>
              <tr>
                <th>Shutdown date</th>
                <th>Model / system</th>
                <th>Recommended replacement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2026-08-01</td>
                <td>Videos API</td>
                <td>---</td>
              </tr>
            </tbody>
          </table>
        `,
        observedAt,
      ),
    ).toEqual([]);
  });

  it("fails closed for conflicting OpenAI shutdown dates in one announcement", () => {
    expect(() =>
      parseOpenAi(
        `
          <h2>2026-07-24: Changed lifecycle table</h2>
          <table>
            <thead>
              <tr>
                <th>Shutdown date</th>
                <th>Model</th>
                <th>Recommended replacement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2026-08-01</td>
                <td><code>gpt-example</code></td>
                <td><code>gpt-next</code></td>
              </tr>
              <tr>
                <td>2026-08-02</td>
                <td><code>gpt-example</code></td>
                <td><code>gpt-next</code></td>
              </tr>
            </tbody>
          </table>
        `,
        observedAt,
      ),
    ).toThrow(/conflicting OpenAI lifecycle rows/i);
  });

  it("maps OpenAI parser errors to invalid_source_result", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        `
          <h2>2026-07-24: Changed lifecycle table</h2>
          <table>
            <thead>
              <tr>
                <th>Shutdown date</th>
                <th>Model</th>
                <th>Recommended replacement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>not a date</td>
                <td><code>gpt-example</code></td>
                <td><code>gpt-next</code></td>
              </tr>
            </tbody>
          </table>
        `,
      );
    try {
      const result = await Effect.runPromise(
        Effect.match(collectOpenAi({ observedAt }), {
          onFailure: (failure) => ({ failure }),
          onSuccess: (success) => ({ success }),
        }),
      );

      expect(result).toMatchObject({
        failure: { code: "invalid_source_result", retryable: false },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
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
