import { load } from "cheerio";
import { Effect } from "effect";
import type { LifecycleRecord } from "@duskline/lifecycle";
import {
  fetchText,
  finalizeRecords,
  makeRecord,
  modelTokens,
  parseDate,
} from "./shared";
import type { CollectContext, SourceDefinition } from "./types";

export const ANTHROPIC_SOURCE: SourceDefinition = {
  id: "anthropic-lifecycle",
  provider: "anthropic",
  platform: "direct",
  label: "Anthropic lifecycle",
  scope: "Anthropic-operated model deprecations and retirement dates.",
  url: "https://platform.claude.com/docs/en/about-claude/model-deprecations",
};

export const parseAnthropic = (html: string, observedAt: string) => {
  const $ = load(html);
  const records: Array<LifecycleRecord> = [];
  $("table").each((_index, table) => {
    const headers = $(table)
      .find("thead th")
      .map((_i, cell) => $(cell).text().trim().toLowerCase())
      .get();
    const modelIndex = headers.findIndex((header) => /model/.test(header));
    const deprecationIndex = headers.findIndex((header) =>
      /deprecat/.test(header),
    );
    const retirementIndex = headers.findIndex((header) =>
      /retire|shutdown|end.of.life/.test(header),
    );
    const replacementIndex = headers.findIndex((header) =>
      /replacement|recommend/.test(header),
    );
    if (modelIndex < 0 || (deprecationIndex < 0 && retirementIndex < 0)) return;

    $(table)
      .find("tbody tr")
      .each((_rowIndex, row) => {
        const cells = $(row)
          .find("td")
          .map((_i, cell) => $(cell).text().trim())
          .get();
        const deprecationDate = parseDate(cells[deprecationIndex] ?? "");
        const shutdownDate = parseDate(cells[retirementIndex] ?? "");
        for (const modelId of modelTokens(cells[modelIndex] ?? "")) {
          records.push(
            makeRecord({
              provider: "anthropic",
              platform: "direct",
              source_id: ANTHROPIC_SOURCE.id,
              model_id: modelId,
              canonical_model_id: null,
              regions: [],
              status: "deprecated",
              announcement_date: null,
              deprecation_date: deprecationDate,
              shutdown_date: shutdownDate,
              replacement_models: modelTokens(cells[replacementIndex] ?? ""),
              source_url: ANTHROPIC_SOURCE.url,
              observed_at: observedAt,
              raw_status: null,
            }),
          );
        }
      });
  });
  return records;
};

export const collectAnthropic = (context: CollectContext) =>
  Effect.flatMap(
    fetchText(ANTHROPIC_SOURCE, { signal: context.signal ?? null }),
    (html) =>
      finalizeRecords(
        ANTHROPIC_SOURCE,
        parseAnthropic(html, context.observedAt),
      ),
  );
