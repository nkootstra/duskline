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

export const OPENAI_SOURCE: SourceDefinition = {
  id: "openai-lifecycle",
  provider: "openai",
  platform: "direct",
  url: "https://developers.openai.com/api/docs/deprecations",
};

export const parseOpenAi = (html: string, observedAt: string) => {
  const $ = load(html);
  const records: Array<LifecycleRecord> = [];

  $("table").each((_index, table) => {
    const headers = $(table)
      .find("thead th")
      .map((_i, cell) => $(cell).text().trim().toLowerCase())
      .get();
    if (!headers.some((header) => /shutdown|deprecat/.test(header))) return;

    $(table)
      .find("tbody tr")
      .each((_rowIndex, row) => {
        const cellElements = $(row).find("td").toArray();
        const cells = cellElements.map((cell) => $(cell).text().trim());
        if (cells.length < 2) return;
        const dateIndex = headers.findIndex((header) =>
          /shutdown|deprecat|retire/.test(header),
        );
        const modelIndex = headers.findIndex((header) =>
          /model|system/.test(header),
        );
        const replacementIndex = headers.findIndex((header) =>
          /replacement|recommend/.test(header),
        );
        const shutdownDate = parseDate(cells[dateIndex] ?? "");
        const modelCodes =
          modelIndex >= 0
            ? $(cellElements[modelIndex])
                .find("code")
                .map((_i, code) => $(code).text().trim())
                .get()
            : [];
        const replacementCodes =
          replacementIndex >= 0
            ? $(cellElements[replacementIndex])
                .find("code")
                .map((_i, code) => $(code).text().trim())
                .get()
            : [];
        const modelIds =
          modelCodes.length > 0
            ? [...new Set(modelCodes)]
            : modelTokens(cells[modelIndex] ?? "");
        const replacements =
          replacementCodes.length > 0
            ? [...new Set(replacementCodes)]
            : modelTokens(cells[replacementIndex] ?? "");
        for (const modelId of modelIds) {
          records.push(
            makeRecord({
              provider: "openai",
              platform: "direct",
              source_id: OPENAI_SOURCE.id,
              model_id: modelId,
              canonical_model_id: null,
              regions: [],
              status: "deprecated",
              announcement_date: null,
              deprecation_date: null,
              shutdown_date: shutdownDate,
              replacement_models: replacements,
              source_url: OPENAI_SOURCE.url,
              observed_at: observedAt,
              raw_status: null,
            }),
          );
        }
      });
  });
  return records;
};

export const collectOpenAi = (context: CollectContext) =>
  Effect.flatMap(
    fetchText(OPENAI_SOURCE, { signal: context.signal ?? null }),
    (html) =>
      finalizeRecords(OPENAI_SOURCE, parseOpenAi(html, context.observedAt)),
  );
