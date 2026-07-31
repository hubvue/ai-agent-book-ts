import "dotenv/config";

import {
  getProviderApiKey,
  getProvider,
  resolveBackend,
} from "./providers.js";

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
  const parsedValue = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export class Config {
  static readonly llmProvider = (
    process.env.LLM_PROVIDER ?? "doubao"
  ).toLowerCase();
  static readonly modelName = process.env.MODEL_NAME ?? "";
  static readonly modelTemperature = environmentNumber(
    "MODEL_TEMPERATURE",
    0.3,
  );
  static readonly modelMaxTokens = environmentNumber("MODEL_MAX_TOKENS", 1000);
  static readonly maxIterations = environmentNumber("MAX_ITERATIONS", 10);
  static readonly enableReasoning =
    (process.env.ENABLE_REASONING ?? "true").toLowerCase() === "true";
  static readonly testPdfUrl =
    process.env.TEST_PDF_URL ??
    "https://www.berkshirehathaway.com/qtrly/1stqtr23.pdf";
  static readonly resultsDirectory = "results";
  static readonly testPdfsDirectory = "fixtures/pdfs";

  static getApiKey(provider = Config.llmProvider): string {
    try {
      return getProviderApiKey(provider);
    } catch {
      return "";
    }
  }

  static getDefaultModel(provider = Config.llmProvider): string {
    if (Config.modelName) {
      return Config.modelName;
    }
    try {
      return getProvider(provider).defaultModel;
    } catch {
      return "";
    }
  }

  static validate(provider = Config.llmProvider): boolean {
    try {
      resolveBackend({ provider });
      return true;
    } catch (error) {
      console.error(`ERROR: ${toErrorMessage(error)}`);
      console.error("Please set it in .env or as an environment variable");
      return false;
    }
  }

  static getModelConfig(): {
    model: string;
    temperature: number;
    max_tokens: number;
  } {
    return {
      model: Config.modelName,
      temperature: reasoningSafeTemperature(
        Config.modelName,
        Config.modelTemperature,
      ),
      max_tokens: Config.modelMaxTokens,
    };
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
