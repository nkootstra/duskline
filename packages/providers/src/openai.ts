import { load } from "cheerio";
import { Effect } from "effect";
import type { LifecycleRecord } from "@duskline/lifecycle";
import { fetchText, finalizeRecords, makeRecord, parseDate } from "./shared";
import {
  SourceFailure,
  type CollectContext,
  type SourceDefinition,
} from "./types";

export const OPENAI_SOURCE: SourceDefinition = {
  id: "openai-lifecycle",
  provider: "openai",
  platform: "direct",
  label: "OpenAI lifecycle",
  scope: "Direct API deprecations, deletion dates, and replacements.",
  url: "https://developers.openai.com/api/docs/deprecations",
};

const replacementHeader = /replacement|recommend|substitute/;
const lifecycleDateHeader = /shutdown|deprecat|retire/;
const noReplacement = /^(?:[-–—]+|none|n\/a|no replacement)$/i;
const headingSelector = "h1, h2, h3, h4, h5, h6";
const nonModelOpenAiRows = new Set([
  "assistants api",
  "audio api",
  "batches api",
  "chat completions api",
  "files api",
  "fine-tuning api",
  "images api",
  "realtime api",
  "responses api",
  "system",
  "videos api",
]);

const unique = (values: ReadonlyArray<string>): Array<string> => [
  ...new Set(values),
];

const isOpenAiModelId = (value: string): boolean =>
  value.length > 1 &&
  value.length < 160 &&
  !/\s|=/.test(value) &&
  !value.startsWith("/") &&
  /[A-Za-z0-9]/.test(value) &&
  !noReplacement.test(value);

const openAiModelTokens = (value: string): Array<string> =>
  unique(
    value
      .split(/\n|→|->|\||,|\s+(?:and|or)\s+/i)
      .map((token) => token.trim())
      .filter(isOpenAiModelId),
  );

const isKnownNonModelOpenAiRow = (value: string): boolean =>
  nonModelOpenAiRows.has(value.trim().toLowerCase()) ||
  /^openai-beta:/i.test(value.trim()) ||
  value.trim().startsWith("/");

const announcementDateForTable = (
  $: ReturnType<typeof load>,
  table: Parameters<ReturnType<typeof load>>[0],
): { readonly text: string; readonly date: string | null } | null => {
  let nearestUndatedHeading: {
    readonly text: string;
    readonly level: number;
  } | null = null;
  for (const element of [table, ...$(table).parents().toArray()]) {
    for (const sibling of $(element).prevAll().toArray()) {
      const previous = $(sibling);
      const heading = previous.is(headingSelector)
        ? previous
        : previous.find(headingSelector).last();
      if (heading.length > 0) {
        const text = heading.text().trim();
        const date = parseDate(text);
        const level = Number(heading.prop("tagName")?.slice(1));
        if (date) {
          if (!nearestUndatedHeading || level < nearestUndatedHeading.level) {
            return { text, date };
          }
          return { text: nearestUndatedHeading.text, date: null };
        }
        nearestUndatedHeading ??= { text, level };
      }
    }
  }
  return nearestUndatedHeading
    ? { text: nearestUndatedHeading.text, date: null }
    : null;
};

const sameStrings = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean => [...left].sort().join("\n") === [...right].sort().join("\n");

const selectNewestAnnouncements = (
  records: ReadonlyArray<LifecycleRecord>,
): Array<LifecycleRecord> => {
  const selected = new Map<string, LifecycleRecord>();
  for (const record of records) {
    const previous = selected.get(record.model_id);
    if (!previous) {
      selected.set(record.model_id, record);
      continue;
    }
    const previousAnnouncement = previous.announcement_date ?? "";
    const announcement = record.announcement_date ?? "";
    if (announcement > previousAnnouncement) {
      selected.set(record.model_id, record);
      continue;
    }
    if (announcement < previousAnnouncement) continue;
    if (record.shutdown_date !== previous.shutdown_date) {
      throw new Error(
        `conflicting OpenAI lifecycle rows for ${record.model_id} in ${announcement || "an undated section"}`,
      );
    }
    if (!sameStrings(record.replacement_models, previous.replacement_models)) {
      selected.set(record.model_id, {
        ...previous,
        replacement_models: unique([
          ...previous.replacement_models,
          ...record.replacement_models,
        ]).sort(),
      });
    }
  }
  return [...selected.values()].sort((left, right) =>
    left.model_id.localeCompare(right.model_id, "en"),
  );
};

export const parseOpenAi = (html: string, observedAt: string) => {
  const $ = load(html);
  const records: Array<LifecycleRecord> = [];

  $("table").each((_index, table) => {
    const headers = $(table)
      .find("thead th")
      .map((_i, cell) => $(cell).text().trim().toLowerCase())
      .get();
    if (!headers.some((header) => lifecycleDateHeader.test(header))) return;

    const dateIndex = headers.findIndex((header) =>
      lifecycleDateHeader.test(header),
    );
    const modelIndex = headers.findIndex((header) =>
      /model|system/.test(header),
    );
    const replacementIndex = headers.findIndex((header) =>
      replacementHeader.test(header),
    );
    if (dateIndex < 0 || modelIndex < 0) {
      throw new Error(
        "OpenAI lifecycle table is missing date or model columns",
      );
    }
    if (replacementIndex < 0) {
      throw new Error(
        "OpenAI lifecycle table has an unsupported replacement column",
      );
    }
    const announcement = announcementDateForTable($, table);
    if (announcement?.text && !announcement.date) {
      throw new Error(
        `OpenAI announcement date could not be parsed: ${announcement.text}`,
      );
    }
    const requiredCellCount =
      Math.max(dateIndex, modelIndex, replacementIndex) + 1;

    $(table)
      .find("tbody tr")
      .each((_rowIndex, row) => {
        const cellElements = $(row).find("td").toArray();
        const cells = cellElements.map((cell) => $(cell).text().trim());
        if (cells.length < requiredCellCount) {
          throw new Error("OpenAI lifecycle row is missing required cells");
        }
        const shutdownText = cells[dateIndex]!.trim();
        const shutdownDate = parseDate(shutdownText);
        if (shutdownText && !shutdownDate) {
          throw new Error(
            `OpenAI shutdown date could not be parsed: ${shutdownText}`,
          );
        }
        const modelCodes = $(cellElements[modelIndex])
          .find("code")
          .map((_i, code) => $(code).text().trim())
          .get();
        const replacementCodes = $(cellElements[replacementIndex])
          .find("code")
          .map((_i, code) => $(code).text().trim())
          .get();
        const modelIds =
          modelCodes.length > 0
            ? unique(modelCodes.filter(isOpenAiModelId))
            : openAiModelTokens(cells[modelIndex] ?? "");
        if (modelIds.length === 0) {
          if (isKnownNonModelOpenAiRow(cells[modelIndex] ?? "")) return;
          throw new Error(
            `OpenAI model cell could not be decoded: ${cells[modelIndex] ?? ""}`,
          );
        }
        const replacements =
          replacementCodes.length > 0
            ? unique(replacementCodes.filter(isOpenAiModelId))
            : openAiModelTokens(cells[replacementIndex] ?? "");
        const replacementText = cells[replacementIndex]?.trim() ?? "";
        if (
          replacementText &&
          !noReplacement.test(replacementText) &&
          replacements.length === 0
        ) {
          throw new Error(
            `OpenAI replacement cell could not be decoded for ${modelIds.join(", ")}`,
          );
        }
        if (!announcement?.date) {
          throw new Error(
            `OpenAI lifecycle table has no dated announcement for ${modelIds.join(", ")}`,
          );
        }
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
              announcement_date: announcement.date,
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
  return selectNewestAnnouncements(records);
};

export const collectOpenAi = (context: CollectContext) =>
  Effect.flatMap(
    fetchText(OPENAI_SOURCE, { signal: context.signal ?? null }),
    (html) =>
      Effect.try({
        try: () => parseOpenAi(html, context.observedAt),
        catch: (error) =>
          new SourceFailure({
            source_id: OPENAI_SOURCE.id,
            code: "invalid_source_result",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          }),
      }).pipe(
        Effect.flatMap((records) => finalizeRecords(OPENAI_SOURCE, records)),
      ),
  );
