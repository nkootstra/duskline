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

export const BEDROCK_SOURCE: SourceDefinition = {
  id: "bedrock-lifecycle",
  provider: "aws_bedrock",
  platform: "bedrock",
  label: "Amazon Bedrock lifecycle",
  scope: "Public Bedrock legacy and end-of-life dates, not account access.",
  url: "https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html",
};

export const parseBedrock = (html: string, observedAt: string) => {
  const $ = load(html);
  const records: Array<LifecycleRecord> = [];
  $("table").each((_index, table) => {
    const context = `${$(table).prevAll("h2,h3,h4").first().text()} ${$(table).text()}`;
    if (!/legacy|end.of.life|eol|deprecat|retir/i.test(context)) return;
    const headers = $(table)
      .find("thead th")
      .map((_i, cell) => $(cell).text().trim().toLowerCase())
      .get();
    const modelIndex = headers.findIndex((header) => /model/.test(header));
    const modelIdIndex = headers.findIndex((header) => /model id/.test(header));
    const regionIndex = headers.findIndex((header) => /region/.test(header));
    const legacyDateIndex = headers.findIndex((header) =>
      /legacy date/.test(header),
    );
    const eolDateIndex = headers.findIndex((header) =>
      /end.of.life|eol/.test(header),
    );
    const replacementIndex = headers.findIndex((header) =>
      /replacement|recommend|successor/.test(header),
    );
    if (modelIndex < 0 && modelIdIndex < 0) return;

    $(table)
      .find("tbody tr")
      .each((_rowIndex, row) => {
        const cells = $(row)
          .find("td")
          .map((_i, cell) => $(cell).text().trim())
          .get();
        if (cells.length !== headers.length) return;
        const legacyDate = parseDate(cells[legacyDateIndex] ?? "");
        const eolDate = parseDate(cells[eolDateIndex] ?? "");
        const rawStatus = eolDate
          ? "legacy with scheduled end of life"
          : "legacy";
        for (const modelId of modelTokens(
          cells[modelIdIndex >= 0 ? modelIdIndex : modelIndex] ?? "",
        )) {
          records.push(
            makeRecord({
              provider: "aws_bedrock",
              platform: "bedrock",
              source_id: BEDROCK_SOURCE.id,
              model_id: modelId,
              canonical_model_id: null,
              regions: (cells[regionIndex] ?? "")
                .split(/[\s,]+/)
                .map((region) => region.trim())
                .filter(Boolean),
              status: "legacy",
              announcement_date: null,
              deprecation_date: legacyDate,
              shutdown_date: eolDate,
              replacement_models: modelTokens(cells[replacementIndex] ?? ""),
              source_url: BEDROCK_SOURCE.url,
              observed_at: observedAt,
              raw_status: rawStatus.trim() || null,
            }),
          );
        }
      });
  });
  return records.filter((record) => record.status !== "unknown");
};

export const collectBedrock = (context: CollectContext) =>
  Effect.flatMap(
    fetchText(BEDROCK_SOURCE, { signal: context.signal ?? null }),
    (html) =>
      finalizeRecords(BEDROCK_SOURCE, parseBedrock(html, context.observedAt)),
  );
