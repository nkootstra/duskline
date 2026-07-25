import { Effect } from "effect";
import type { LifecycleRecord } from "@duskline/lifecycle";
import { fetchText, finalizeRecords, makeRecord, parseDate } from "./shared";
import type { CollectContext, SourceDefinition } from "./types";

export const FIREWORKS_CHANGELOG_SOURCE: SourceDefinition = {
  id: "fireworks-changelog",
  provider: "fireworks",
  platform: "fireworks_serverless",
  label: "Fireworks changelog",
  scope: "Official serverless deprecation announcements and migration notices.",
  url: "https://docs.fireworks.ai/updates/changelog",
};

const FIREWORKS_CHANGELOG_DOCUMENT_URL =
  "https://docs.fireworks.ai/updates/changelog.md";

const modelIdFromUrl = (url: string): string | null => {
  const match =
    /^https:\/\/app\.fireworks\.ai\/models\/fireworks\/([^/?#]+)/i.exec(url);
  return match?.[1] ? `accounts/fireworks/models/${match[1]}` : null;
};

const linksIn = (markdown: string) =>
  [...markdown.matchAll(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g)].flatMap(
    ([, label, url]) => {
      const modelId = url ? modelIdFromUrl(url) : null;
      return modelId && label ? [{ label: label.trim(), modelId }] : [];
    },
  );

const plainMarkdown = (markdown: string): string =>
  markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const modelNames = (markdown: string): Array<string> =>
  plainMarkdown(markdown)
    .split(/\s+(?:and|or)\s+|,\s*/i)
    .map((model) => model.trim())
    .filter(Boolean);

const headingAnchor = (title: string): string =>
  plainMarkdown(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const parseFireworksChangelog = (
  markdown: string,
  observedAt: string,
) => {
  const records: Array<LifecycleRecord> = [];
  const updates = [
    ...markdown.matchAll(
      /<Update\s+label="(\d{4}-\d{2}-\d{2})"[^>]*>([\s\S]*?)<\/Update>/g,
    ),
  ];

  for (const update of updates) {
    const announcementDate = parseDate(update[1]);
    const body = update[2] ?? "";
    const title = body.match(/^\s*#\s+(.+)$/m)?.[1]?.trim() ?? "";
    if (
      !/(?:serverless|model).*(?:deprecat|retir|remov|end.of.life)/i.test(title)
    ) {
      continue;
    }

    const models = new Map<string, Array<string>>();
    for (const line of body.split("\n")) {
      const migration = line.match(
        /^\s*[*-]\s+(.+?)\s+[—–-]\s+migrate to\s+(.+)$/i,
      );
      if (!migration?.[1] || !migration[2]) continue;
      const source =
        linksIn(migration[1])[0]?.modelId ?? plainMarkdown(migration[1]);
      const linkedReplacements = linksIn(migration[2]).map(
        ({ modelId }) => modelId,
      );
      models.set(
        source,
        linkedReplacements.length > 0
          ? linkedReplacements
          : modelNames(migration[2]),
      );
    }

    if (models.size === 0 && !/legacy models/i.test(title)) {
      const deprecation = body.match(
        /^\s*(.+?)\s+(?:is|are)\s+deprecated from serverless\.(.*)$/im,
      );
      if (!deprecation?.[1]) continue;
      const sourceModels = modelNames(deprecation[1]);
      const migrationText = deprecation?.[2]?.match(
        /migrate to\s+(.+?)(?:\.$|$)/i,
      )?.[1];
      const linkedReplacements = migrationText
        ? linksIn(migrationText).map(({ modelId }) => modelId)
        : [];
      const replacements =
        linkedReplacements.length > 0
          ? linkedReplacements
          : migrationText
            ? modelNames(migrationText)
            : [];
      for (const modelId of sourceModels) {
        models.set(modelId, replacements);
      }
    }

    const deletionMatch = `${title} ${body}`.match(
      /(?:remov|retir|shutdown|delet|decommission)[^.\n]{0,100}?((?:20\d{2}-\d{2}-\d{2})|(?:[A-Za-z]+\s+\d{1,2},?\s+20\d{2}))/i,
    );
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
          announcement_date: announcementDate,
          deprecation_date: announcementDate,
          shutdown_date: parseDate(deletionMatch?.[1]),
          replacement_models: replacements,
          source_url: `${FIREWORKS_CHANGELOG_SOURCE.url}#${headingAnchor(title)}`,
          observed_at: observedAt,
          raw_status: title,
        }),
      );
    }
  }

  return records;
};

export const collectFireworksChangelog = (context: CollectContext) =>
  Effect.flatMap(
    fetchText(
      {
        ...FIREWORKS_CHANGELOG_SOURCE,
        url: FIREWORKS_CHANGELOG_DOCUMENT_URL,
      },
      { signal: context.signal ?? null },
    ),
    (markdown) =>
      finalizeRecords(
        FIREWORKS_CHANGELOG_SOURCE,
        parseFireworksChangelog(markdown, context.observedAt),
      ),
  );
