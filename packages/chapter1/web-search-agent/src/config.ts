import "dotenv/config";

export const KIMI_BASE_URL = "https://api.moonshot.cn/v1";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_MODEL = "openai/gpt-5.6-luna";
export const DEFAULT_MODEL = "kimi-k3";

export interface ResolvedLlmBackend {
  apiKey: string;
  baseUrl: string;
  model: string;
  usingOpenRouter: boolean;
}

export function mapModelToOpenRouter(
  model: string,
  options: {
    substituteUnknown?: boolean;
    environment?: NodeJS.ProcessEnv;
  } = {},
): string {
  const normalizedModel = model.trim();
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

export function resolveLlmBackend(
  primaryKey: string | undefined,
  baseUrl: string,
  model: string,
  environment: NodeJS.ProcessEnv = process.env,
): ResolvedLlmBackend {
  const normalizedPrimaryKey = primaryKey?.trim() ?? "";
  const openRouterKey = environment.OPENROUTER_API_KEY?.trim() ?? "";

  if (openRouterKey && model.toLowerCase().startsWith("gpt-5")) {
    return {
      apiKey: openRouterKey,
      baseUrl: environment.OPENROUTER_BASE_URL?.trim() || OPENROUTER_BASE_URL,
      model: mapModelToOpenRouter(model, { environment }),
      usingOpenRouter: true,
    };
  }
  if (normalizedPrimaryKey) {
    return {
      apiKey: normalizedPrimaryKey,
      baseUrl,
      model,
      usingOpenRouter: false,
    };
  }
  if (openRouterKey) {
    return {
      apiKey: openRouterKey,
      baseUrl: environment.OPENROUTER_BASE_URL?.trim() || OPENROUTER_BASE_URL,
      model: mapModelToOpenRouter(model, { environment }),
      usingOpenRouter: true,
    };
  }
  throw new Error(
    "No API key found. Set MOONSHOT_API_KEY / KIMI_API_KEY, or OPENROUTER_API_KEY as a model-only fallback.",
  );
}

export function reasoningSafeTemperature(
  model: string | undefined,
  requested = 1,
): number {
  const normalizedModel = (model ?? "").toLowerCase().replaceAll("/", "-");
  return normalizedModel.includes("kimi-k3") ||
    normalizedModel.includes("gpt-5")
    ? 1
    : requested;
}

function environmentNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

export class Config {
  static get apiKey(): string {
    return process.env.MOONSHOT_API_KEY?.trim() ||
      process.env.KIMI_API_KEY?.trim() ||
      "";
  }

  static readonly kimiBaseUrl = process.env.KIMI_BASE_URL?.trim() || KIMI_BASE_URL;
  static readonly defaultModel = process.env.DEFAULT_MODEL?.trim() || DEFAULT_MODEL;
  static readonly maxSearchIterations = environmentNumber(
    "MAX_SEARCH_ITERATIONS",
    5,
  );
  static readonly searchTimeoutSeconds = environmentNumber("SEARCH_TIMEOUT", 30);
  static readonly logLevel = "INFO";

  static getApiKey(apiKey?: string): string {
    return apiKey?.trim() || Config.apiKey;
  }

  static validate(): boolean {
    if (!Config.apiKey) {
      console.error("错误: 未设置 MOONSHOT_API_KEY 环境变量");
      console.error("请设置环境变量: export MOONSHOT_API_KEY='your-api-key'");
      console.error("(也可使用旧变量 KIMI_API_KEY，或仅模型兜底 OPENROUTER_API_KEY)");
      return false;
    }
    return true;
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
