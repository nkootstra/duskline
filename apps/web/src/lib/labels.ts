import type { Platform, Provider } from "@duskline/lifecycle";

export const providerLabel = (provider: Provider): string =>
  (
    ({
      anthropic: "Anthropic",
      aws_bedrock: "Bedrock",
      fireworks: "Fireworks",
      openai: "OpenAI",
      openrouter: "OpenRouter",
    }) as const
  )[provider];

export const platformLabel = (platform: Platform): string =>
  (
    ({
      bedrock: "Bedrock",
      direct: "Direct",
      fireworks_serverless: "Serverless",
      openrouter: "OpenRouter",
    }) as const
  )[platform];
