import "dotenv/config";

export interface ProviderSpec {
  name: string;
  baseUrl: string;
  defaultModel: string;
  keyVariables: readonly string[];
  baseUrlVariable?: string;
  requiresKey?: boolean;
  namespacesModels?: boolean;
}

export interface ResolvedBackend {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
  usingOpenRouter: boolean;
}

export interface ResolveBackendOptions {
  provider: string;
  model?: string;
  apiKey?: string;
  environment?: NodeJS.ProcessEnv;
}

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_MODEL = "openai/gpt-5.6-luna";
const PLACEHOLDER_KEY = "not-needed";

export const PROVIDERS = {
  siliconflow: {
    name: "siliconflow",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen3.5-397B-A17B",
    keyVariables: ["SILICONFLOW_API_KEY"],
  },
  doubao: {
    name: "doubao",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-1-6-thinking-250715",
    keyVariables: ["ARK_API_KEY"],
  },
  kimi: {
    name: "kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k3",
    keyVariables: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    baseUrlVariable: "KIMI_BASE_URL",
  },
  deepseek: {
    name: "deepseek",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    keyVariables: ["DEEPSEEK_API_KEY"],
    baseUrlVariable: "DEEPSEEK_BASE_URL",
  },
  zhipu: {
    name: "zhipu",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-5.2",
    keyVariables: ["ZHIPU_API_KEY"],
  },
  openrouter: {
    name: "openrouter",
    baseUrl: OPENROUTER_BASE_URL,
    defaultModel: OPENROUTER_DEFAULT_MODEL,
    keyVariables: ["OPENROUTER_API_KEY"],
    baseUrlVariable: "OPENROUTER_BASE_URL",
    namespacesModels: true,
  },
  openai: {
    name: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    keyVariables: ["OPENAI_API_KEY"],
    baseUrlVariable: "OPENAI_BASE_URL",
  },
  gemini: {
    name: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    keyVariables: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  },
  ollama: {
    name: "ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen3:8b",
    keyVariables: ["OLLAMA_API_KEY"],
    baseUrlVariable: "OLLAMA_BASE_URL",
    requiresKey: false,
  },
} as const satisfies Record<string, ProviderSpec>;

const PROVIDER_ALIASES: Record<string, keyof typeof PROVIDERS> = {
  moonshot: "kimi",
  ark: "doubao",
  google: "gemini",
};

export const SUPPORTED_PROVIDERS = [
  ...new Set([...Object.keys(PROVIDERS), ...Object.keys(PROVIDER_ALIASES)]),
].sort();

export function canonicalProvider(provider: string): string {
  const normalizedProvider = (provider ?? "").trim().toLowerCase();
  return PROVIDER_ALIASES[normalizedProvider] ?? normalizedProvider;
}

export function getProvider(provider: string): ProviderSpec {
  const canonicalName = canonicalProvider(provider);
  const providerSpec = PROVIDERS[canonicalName as keyof typeof PROVIDERS];
  if (!providerSpec) {
    throw new Error(
      `Unsupported provider: ${JSON.stringify(provider)}. Supported: ${Object.keys(PROVIDERS).sort().join(", ")}`,
    );
  }
  return providerSpec;
}

export function getProviderApiKey(
  provider: string | ProviderSpec,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const providerSpec =
    typeof provider === "string" ? getProvider(provider) : provider;
  for (const variableName of providerSpec.keyVariables) {
    const key = environment[variableName]?.trim();
    if (key) {
      return key;
    }
  }
  return "";
}

export function getProviderBaseUrl(
  provider: string | ProviderSpec,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const providerSpec =
    typeof provider === "string" ? getProvider(provider) : provider;
  if (providerSpec.baseUrlVariable) {
    return (
      environment[providerSpec.baseUrlVariable]?.trim() ?? ""
    ) || providerSpec.baseUrl;
  }
  return providerSpec.baseUrl;
}

export function mapModelToOpenRouter(
  model: string,
  options: {
    substituteUnknown?: boolean;
    environment?: NodeJS.ProcessEnv;
  } = {},
): string {
  const normalizedModel = (model ?? "").trim();
  if (normalizedModel.includes("/")) {
    return normalizedModel;
  }

  const lowerModel = normalizedModel.toLowerCase();
  if (/^(gpt-|o1-|o3-|o4-)/.test(lowerModel)) {
    return `openai/${normalizedModel}`;
  }
  if (lowerModel.startsWith("claude-")) {
    if (lowerModel.includes("sonnet")) {
      return "anthropic/claude-sonnet-4.6";
    }
    if (lowerModel.includes("haiku")) {
      return "anthropic/claude-haiku-4.5";
    }
    return "anthropic/claude-opus-4.8";
  }
  if (lowerModel.startsWith("kimi")) {
    return "moonshotai/kimi-k2.6";
  }
  if (lowerModel.startsWith("deepseek")) {
    return `deepseek/${normalizedModel}`;
  }
  if (options.substituteUnknown) {
    return (
      options.environment?.OPENROUTER_MODEL ??
      process.env.OPENROUTER_MODEL ??
      OPENROUTER_DEFAULT_MODEL
    );
  }
  return normalizedModel;
}

export function resolveBackend({
  provider,
  model,
  apiKey,
  environment = process.env,
}: ResolveBackendOptions): ResolvedBackend {
  const providerSpec = getProvider(provider);
  const resolvedModel = model || providerSpec.defaultModel;
  const providerKey =
    apiKey?.trim() || getProviderApiKey(providerSpec, environment);
  const explicitOpenRouterKey =
    providerSpec.name === "openrouter" ? providerKey : "";
  const openRouterKey =
    explicitOpenRouterKey || environment.OPENROUTER_API_KEY?.trim() || "";

  if (
    openRouterKey &&
    resolvedModel.toLowerCase().startsWith("gpt-5") &&
    providerSpec.name !== "openai"
  ) {
    return buildOpenRouterBackend({
      model: resolvedModel,
      apiKey: openRouterKey,
      requestedProvider: providerSpec.name,
      environment,
    });
  }

  if (providerKey || providerSpec.requiresKey === false) {
    return {
      apiKey: providerKey || PLACEHOLDER_KEY,
      baseUrl: getProviderBaseUrl(providerSpec, environment),
      model: providerSpec.namespacesModels
        ? mapModelToOpenRouter(resolvedModel, {
            substituteUnknown: true,
            environment,
          })
        : resolvedModel,
      provider: providerSpec.name,
      usingOpenRouter: providerSpec.name === "openrouter",
    };
  }

  if (openRouterKey) {
    return buildOpenRouterBackend({
      model: resolvedModel,
      apiKey: openRouterKey,
      requestedProvider: providerSpec.name,
      environment,
    });
  }

  const requiredKeys = providerSpec.keyVariables.join(" / ") || "(none)";
  throw new Error(
    `No API key found for provider ${JSON.stringify(providerSpec.name)}. ` +
      `Set ${requiredKeys}, or OPENROUTER_API_KEY as a universal fallback. ` +
      "For a zero-cost setup use provider 'ollama' (local, no key) or " +
      "OPENROUTER_MODEL with a ':free' model id.",
  );
}

function buildOpenRouterBackend({
  model,
  apiKey,
  requestedProvider,
  environment,
}: {
  model: string;
  apiKey: string;
  requestedProvider: string;
  environment: NodeJS.ProcessEnv;
}): ResolvedBackend {
  return {
    apiKey: apiKey || PLACEHOLDER_KEY,
    baseUrl:
      environment.OPENROUTER_BASE_URL?.trim() || OPENROUTER_BASE_URL,
    model: mapModelToOpenRouter(model, { environment }),
    provider: requestedProvider,
    usingOpenRouter: true,
  };
}
