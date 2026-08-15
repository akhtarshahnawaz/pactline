import "server-only";

import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";

export const providerIds = [
  "openai",
  "anthropic",
  "openai-compatible",
] as const;

export type ProviderId = (typeof providerIds)[number];

type ProviderConfig = {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseURL?: string;
};

export class ModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

function readProviderId(): ProviderId {
  const value = process.env.LLM_PROVIDER?.trim().toLowerCase() || "openai";

  if (providerIds.includes(value as ProviderId)) {
    return value as ProviderId;
  }

  throw new ModelConfigurationError(
    `Unsupported LLM_PROVIDER "${value}". Expected one of: ${providerIds.join(", ")}.`,
  );
}

function readConfig(): ProviderConfig {
  const provider = readProviderId();
  const model = process.env.LLM_MODEL?.trim();

  if (!model) {
    throw new ModelConfigurationError("LLM_MODEL is not configured.");
  }

  if (provider === "openai") {
    return {
      provider,
      model,
      apiKey: process.env.OPENAI_API_KEY?.trim(),
    };
  }

  if (provider === "anthropic") {
    return {
      provider,
      model,
      apiKey: process.env.ANTHROPIC_API_KEY?.trim(),
    };
  }

  return {
    provider,
    model,
    apiKey: process.env.LLM_API_KEY?.trim(),
    baseURL: process.env.LLM_BASE_URL?.trim(),
  };
}

function requireCompleteConfig() {
  const config = readConfig();

  if (!config.apiKey) {
    const variable =
      config.provider === "openai"
        ? "OPENAI_API_KEY"
        : config.provider === "anthropic"
          ? "ANTHROPIC_API_KEY"
          : "LLM_API_KEY";
    throw new ModelConfigurationError(`${variable} is not configured.`);
  }

  if (config.provider === "openai-compatible" && !config.baseURL) {
    throw new ModelConfigurationError(
      "LLM_BASE_URL is required for an OpenAI-compatible provider.",
    );
  }

  return config;
}

export function assertModelConfiguration() {
  requireCompleteConfig();
}

export function createChatModel(): BaseChatModel {
  const config = requireCompleteConfig();

  if (config.provider === "anthropic") {
    return new ChatAnthropic({
      model: config.model,
      apiKey: config.apiKey,
      temperature: 0,
      maxRetries: 2,
      clientOptions: { timeout: 120_000 },
    });
  }

  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    // Newer OpenAI models (the gpt-5 and o-series reasoning models) reject
    // any temperature other than their default (1), so it's left unset here
    // rather than forced to 0. Anthropic models still get temperature: 0
    // above, since Claude supports it.
    maxRetries: 2,
    timeout: 120_000,
    configuration:
      config.provider === "openai-compatible"
        ? { baseURL: config.baseURL }
        : undefined,
  });
}

export function getSafeRuntimeDescriptor() {
  const provider = readProviderId();

  return {
    orchestrator: "LangGraph",
    provider,
    model: process.env.LLM_MODEL?.trim() || "Not configured",
    configured:
      provider === "openai"
        ? Boolean(process.env.OPENAI_API_KEY)
        : provider === "anthropic"
          ? Boolean(process.env.ANTHROPIC_API_KEY)
          : Boolean(process.env.LLM_API_KEY && process.env.LLM_BASE_URL),
  };
}
