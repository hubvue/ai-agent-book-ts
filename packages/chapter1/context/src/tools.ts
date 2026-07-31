import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { toErrorMessage } from "./config.js";

export interface ToolResult {
  [key: string]: unknown;
  error?: string;
}

const EXCHANGE_RATES: Readonly<Record<string, number>> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.5,
  CNY: 7.24,
  CAD: 1.36,
  AUD: 1.53,
  CHF: 0.88,
  INR: 83.12,
  SGD: 1.34,
};

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  $: "USD",
  "US$": "USD",
  "U.S.$": "USD",
  "USD$": "USD",
  "S$": "SGD",
  "SG$": "SGD",
  "SGD$": "SGD",
  "A$": "AUD",
  "AU$": "AUD",
  "AUD$": "AUD",
  "C$": "CAD",
  "CA$": "CAD",
  "CAD$": "CAD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
};

const CALCULATOR_BINDINGS: Readonly<Record<string, number | Function>> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  floor: Math.floor,
  ceil: Math.ceil,
  log: Math.log,
  exp: Math.exp,
  PI: Math.PI,
  E: Math.E,
};

export class ToolRegistry {
  async parsePdf(url: string): Promise<ToolResult> {
    try {
      const pdfBytes = await loadPdfBytes(url);
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const document = await pdfjs.getDocument({
        data: new Uint8Array(pdfBytes),
        useWorkerFetch: false,
      }).promise;

      const content: Array<{ page: number; text: string }> = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        content.push({ page: pageNumber, text });
      }

      const metadata = await document.getMetadata().catch(() => null);
      return {
        url,
        num_pages: document.numPages,
        content,
        metadata: metadata?.info ?? {},
      };
    } catch (error) {
      return { error: toErrorMessage(error) };
    }
  }

  convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): ToolResult {
    try {
      const normalizedFromCurrency = normalizeCurrencyCode(fromCurrency);
      const normalizedToCurrency = normalizeCurrencyCode(toCurrency);
      const fromRate = EXCHANGE_RATES[normalizedFromCurrency];
      const toRate = EXCHANGE_RATES[normalizedToCurrency];

      if (fromRate === undefined || toRate === undefined) {
        return {
          error: `Unsupported currency: ${normalizedFromCurrency} or ${normalizedToCurrency}`,
        };
      }

      const convertedAmount = (amount / fromRate) * toRate;
      return {
        original_amount: amount,
        from_currency: normalizedFromCurrency,
        to_currency: normalizedToCurrency,
        converted_amount: roundTo(convertedAmount, 2),
        exchange_rate: roundTo(toRate / fromRate, 4),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return { error: toErrorMessage(error) };
    }
  }

  calculate(expression: string): ToolResult {
    try {
      const normalizedExpression = expression.replaceAll("^", "**");
      validateMathExpression(normalizedExpression);
      const context = vm.createContext(
        { ...CALCULATOR_BINDINGS },
        { codeGeneration: { strings: false, wasm: false } },
      );
      const result = new vm.Script(normalizedExpression).runInContext(context, {
        timeout: 100,
      }) as unknown;

      if (typeof result !== "number" || !Number.isFinite(result)) {
        throw new Error("Expression must produce a finite number");
      }
      return {
        expression: normalizedExpression,
        result,
        type: Number.isInteger(result) ? "int" : "float",
      };
    } catch (error) {
      return { error: toErrorMessage(error) };
    }
  }

  codeInterpreter(code: string): ToolResult {
    const printedLines: string[] = [];
    try {
      const sandbox: Record<string, unknown> = {
        console: {
          log: (...values: unknown[]) => {
            printedLines.push(values.map(formatPrintedValue).join(" "));
          },
        },
        Math,
        JSON,
      };
      const context = vm.createContext(sandbox, {
        codeGeneration: { strings: false, wasm: false },
      });
      const captureCode = `
        ;globalThis.__agentBookCapture = {
          result: typeof result === "undefined" ? undefined : result,
          total: typeof total === "undefined" ? undefined : total,
          output: typeof output === "undefined" ? undefined : output,
          answer: typeof answer === "undefined" ? undefined : answer,
          final: typeof final === "undefined" ? undefined : final
        };
      `;
      new vm.Script(`${code}\n${captureCode}`).runInContext(context, {
        timeout: 1_000,
      });

      const capturedVariables = compactRecord(
        sandbox.__agentBookCapture as Record<string, unknown>,
      );
      const preferredResult =
        capturedVariables.result ??
        capturedVariables.total ??
        capturedVariables.output ??
        capturedVariables.answer ??
        capturedVariables.final ??
        null;

      return {
        code,
        result: cloneJsonValue(preferredResult),
        output: printedLines.length > 0 ? `${printedLines.join("\n")}\n` : null,
        variables: cloneJsonValue(capturedVariables),
        success: true,
      };
    } catch (error) {
      return {
        code,
        error: toErrorMessage(error),
        success: false,
      };
    }
  }
}

export function normalizeCurrencyCode(code: string): string {
  const normalizedCode = String(code ?? "").trim().toUpperCase();
  const symbolCode = CURRENCY_SYMBOLS[normalizedCode];
  if (symbolCode) {
    return symbolCode;
  }
  if (normalizedCode.endsWith("$")) {
    const prefix = normalizedCode.slice(0, -1).trim();
    if (EXCHANGE_RATES[prefix] !== undefined) {
      return prefix;
    }
    if (prefix === "US" || prefix === "U.S.") {
      return "USD";
    }
    if (prefix === "AU" || prefix === "A") {
      return "AUD";
    }
    if (prefix === "CA" || prefix === "C") {
      return "CAD";
    }
  }
  return normalizedCode;
}

async function loadPdfBytes(url: string): Promise<Buffer> {
  if (url.startsWith("file://")) {
    return readFile(fileURLToPath(url));
  }
  if (isLocalPath(url)) {
    return readFile(url);
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to download PDF: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function isLocalPath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /^[A-Za-z]:[\\/]/.test(value)
  );
}

function validateMathExpression(expression: string): void {
  if (!/^[\d\s+\-*/%().,A-Za-z_]+$/.test(expression)) {
    throw new Error("Expression contains unsupported characters");
  }
  const identifiers = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const unsupportedName = identifiers.find(
    (identifier) => CALCULATOR_BINDINGS[identifier] === undefined,
  );
  if (unsupportedName) {
    throw new Error(`Unsupported calculator name: ${unsupportedName}`);
  }
}

function roundTo(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function formatPrintedValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compactRecord(
  record: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function cloneJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value, jsonSafeReplacer)) as unknown;
  }
}

function jsonSafeReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return [...value];
  }
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  return value;
}
