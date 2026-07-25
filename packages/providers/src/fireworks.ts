import { load } from "cheerio";
import { Effect } from "effect";
import { Schema } from "effect";
import type { LifecycleRecord } from "@duskline/lifecycle";
import {
  fetchText,
  finalizeRecords,
  makeRecord,
  modelTokens,
  parseDate,
} from "./shared";
import {
  SourceFailure,
  type CollectContext,
  type SourceDefinition,
} from "./types";

export const FIREWORKS_CHANGELOG_SOURCE: SourceDefinition = {
  id: "fireworks-changelog",
  provider: "fireworks",
  platform: "fireworks_serverless",
  label: "Fireworks changelog",
  scope: "Serverless deprecation announcements and migration notices.",
  url: "https://docs.fireworks.ai/updates/changelog",
};

export const FIREWORKS_MODELS_SOURCE: SourceDefinition = {
  id: "fireworks-models",
  provider: "fireworks",
  platform: "fireworks_serverless",
  label: "Fireworks models API",
  scope: "Authenticated serverless model deprecation metadata.",
  url: "https://api.fireworks.ai/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=200",
};

export const parseFireworksChangelog = (html: string, observedAt: string) => {
  const $ = load(html);
  const records: Array<LifecycleRecord> = [];
  $("h1,h2,h3,h4").each((_index, heading) => {
    const title = $(heading)
      .text()
      .replace(/^\u200b/, "")
      .trim();
    if (
      !/(?:serverless|model).*(?:deprecat|retir|remov|end.of.life)/i.test(title)
    ) {
      return;
    }
    const update = $(heading).closest(".update");
    const scope =
      update.length > 0
        ? update.find(".prose-sm").first()
        : $(heading).parent();
    const bodyParts: Array<string> = [];
    let sibling = $(heading).next();
    while (
      sibling.length > 0 &&
      !/^H[1234]$/.test(sibling[0]!.tagName.toUpperCase())
    ) {
      bodyParts.push(sibling.text().trim());
      sibling = sibling.next();
    }
    const body = update.length > 0 ? scope.text().trim() : bodyParts.join("\n");
    const modelMatches = [
      ...body.matchAll(/accounts\/fireworks\/models\/([a-z0-9][a-z0-9._-]+)/gi),
    ].map((match) => `accounts/fireworks/models/${match[1]!}`);
    const models = new Map<string, Array<string>>();
    for (const modelId of modelMatches) {
      models.set(modelId, []);
    }
    if (models.size === 0) {
      scope.find("li").each((_itemIndex, item) => {
        const migration = $(item)
          .text()
          .trim()
          .match(/^(.+?)\s+[—–-]\s+migrate to\s+(.+)$/i);
        const modelId = migration?.[1];
        const replacementText = migration?.[2];
        if (!modelId || !replacementText) return;
        models.set(
          modelId.trim(),
          replacementText
            .split(/\s+or\s+/i)
            .map((replacement) => replacement.trim())
            .filter(Boolean),
        );
      });
    }
    if (models.size === 0 && !/legacy models/i.test(title)) {
      const titleModels = title
        .replace(/^.*?deprecation\s*[:—–-]\s*/i, "")
        .split(/\s+and\s+/i)
        .map((model) => model.trim())
        .filter(Boolean);
      const sentenceReplacement = body.match(
        /migrate to\s+(.+?)(?:\.$|$)/i,
      )?.[1];
      const replacements = sentenceReplacement
        ? sentenceReplacement
            .split(/\s+or\s+/i)
            .map((replacement) => replacement.trim())
            .filter(Boolean)
        : [];
      for (const modelId of titleModels) {
        models.set(modelId, replacements);
      }
    }
    const deprecationDate = parseDate(
      update.length > 0 ? update.text() : `${title} ${body}`,
    );
    const deletionMatch = `${title} ${body}`.match(
      /(?:remov|retir|shutdown|delet|decommission)[^.\n]{0,80}?((?:20\d{2}-\d{2}-\d{2})|(?:[A-Za-z]+\s+\d{1,2},?\s+20\d{2}))/i,
    );
    const headingId = $(heading).attr("id");
    for (const [modelId, replacements] of models) {
      records.push(
        makeRecord({
          provider: "fireworks",
          platform: "fireworks_serverless",
          source_id: FIREWORKS_CHANGELOG_SOURCE.id,
          model_id: modelId,
          canonical_model_id: null,
          regions: [],
          status: "deprecated",
          announcement_date: deprecationDate,
          deprecation_date: deprecationDate,
          shutdown_date: parseDate(deletionMatch?.[1]),
          replacement_models: replacements,
          source_url: headingId
            ? `${FIREWORKS_CHANGELOG_SOURCE.url}#${headingId}`
            : FIREWORKS_CHANGELOG_SOURCE.url,
          observed_at: observedAt,
          raw_status: title,
        }),
      );
    }
  });
  return records;
};

const FireworksDate = Schema.Struct({
  year: Schema.Number,
  month: Schema.Number,
  day: Schema.Number,
});
const FireworksModel = Schema.Struct({
  name: Schema.String,
  displayName: Schema.optionalKey(Schema.String),
  deprecationDate: Schema.optionalKey(Schema.NullOr(FireworksDate)),
  supportsServerless: Schema.optionalKey(Schema.Boolean),
});
const FireworksResponse = Schema.Struct({
  models: Schema.Array(FireworksModel),
  nextPageToken: Schema.optionalKey(Schema.String),
  totalSize: Schema.optionalKey(Schema.Number),
});

const fireworksDate = (
  value: typeof FireworksDate.Type | null | undefined,
): string | null =>
  value
    ? parseDate(
        `${value.year.toString().padStart(4, "0")}-${value.month
          .toString()
          .padStart(2, "0")}-${value.day.toString().padStart(2, "0")}`,
      )
    : null;

export const parseFireworksModelsPage = (json: unknown) =>
  Schema.decodeUnknownSync(FireworksResponse)(json);

export const parseFireworksModels = (
  json: unknown,
  observedAt: string,
  sourceUrl = FIREWORKS_MODELS_SOURCE.url,
) => {
  const response = Schema.decodeUnknownSync(FireworksResponse)(json);
  return response.models
    .filter((model) => model.deprecationDate)
    .map((model) =>
      makeRecord({
        provider: "fireworks",
        platform: "fireworks_serverless",
        source_id: FIREWORKS_MODELS_SOURCE.id,
        model_id: model.name,
        canonical_model_id: null,
        regions: [],
        status: "deprecated",
        announcement_date: null,
        deprecation_date: fireworksDate(model.deprecationDate),
        shutdown_date: null,
        replacement_models: [],
        source_url: sourceUrl,
        observed_at: observedAt,
        raw_status: null,
      }),
    );
};

export const collectFireworksChangelog = (context: CollectContext) =>
  Effect.flatMap(
    fetchText(FIREWORKS_CHANGELOG_SOURCE, { signal: context.signal ?? null }),
    (html) =>
      finalizeRecords(
        FIREWORKS_CHANGELOG_SOURCE,
        parseFireworksChangelog(html, context.observedAt),
      ),
  );

export const collectFireworksModels = (context: CollectContext) => {
  if (!context.fireworksApiKey) {
    return Effect.fail(
      new SourceFailure({
        source_id: FIREWORKS_MODELS_SOURCE.id,
        code: "credentials_missing",
        message: "FIREWORKS_API_KEY is not configured",
        retryable: false,
      }),
    );
  }
  const accountId = context.fireworksAccountId ?? "fireworks";
  const endpoint = new URL(
    `https://api.fireworks.ai/v1/accounts/${encodeURIComponent(accountId)}/models`,
  );
  endpoint.searchParams.set("filter", "supports_serverless=true");
  endpoint.searchParams.set("pageSize", "200");

  return Effect.gen(function* () {
    const records: Array<LifecycleRecord> = [];
    let pageToken: string | undefined;
    do {
      const pageUrl = new URL(endpoint);
      if (pageToken) pageUrl.searchParams.set("pageToken", pageToken);
      const pageSource = {
        ...FIREWORKS_MODELS_SOURCE,
        url: pageUrl.toString(),
      };
      const text = yield* fetchText(pageSource, {
        signal: context.signal ?? null,
        headers: { authorization: `Bearer ${context.fireworksApiKey}` },
      });
      const page = yield* Effect.try({
        try: () => parseFireworksModelsPage(JSON.parse(text) as unknown),
        catch: (error) =>
          new SourceFailure({
            source_id: FIREWORKS_MODELS_SOURCE.id,
            code: "invalid_source_result",
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          }),
      });
      records.push(
        ...parseFireworksModels(page, context.observedAt, endpoint.toString()),
      );
      pageToken = page.nextPageToken || undefined;
    } while (pageToken);

    return yield* finalizeRecords(FIREWORKS_MODELS_SOURCE, records, {
      allowEmpty: true,
      observedAt: context.observedAt,
    });
  });
};
