import { SOURCE_IDS } from "@duskline/lifecycle";
import { ANTHROPIC_SOURCE, collectAnthropic } from "./anthropic";
import { BEDROCK_SOURCE, collectBedrock } from "./bedrock";
import {
  FIREWORKS_CHANGELOG_SOURCE,
  collectFireworksChangelog,
} from "./fireworks";
import { OPENAI_SOURCE, collectOpenAi } from "./openai";
import { OPENROUTER_SOURCE, collectOpenRouter } from "./openrouter";
import type { SourceRegistryEntry } from "./types";

export const SOURCE_REGISTRY = [
  { source: OPENAI_SOURCE, collect: collectOpenAi },
  { source: ANTHROPIC_SOURCE, collect: collectAnthropic },
  { source: BEDROCK_SOURCE, collect: collectBedrock },
  {
    source: FIREWORKS_CHANGELOG_SOURCE,
    collect: collectFireworksChangelog,
  },
  { source: OPENROUTER_SOURCE, collect: collectOpenRouter },
] as const satisfies ReadonlyArray<SourceRegistryEntry>;

const registryIds = SOURCE_REGISTRY.map(({ source }) => source.id).sort();
const contractIds = [...SOURCE_IDS].sort();
if (
  registryIds.length !== contractIds.length ||
  registryIds.some((id, index) => id !== contractIds[index])
) {
  throw new Error(
    "Provider registry does not match the lifecycle source contract",
  );
}
