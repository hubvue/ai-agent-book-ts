import path from "node:path";

import { describe, expect, test } from "vitest";

import { ToolRegistry } from "../src/tools.js";

describe("ToolRegistry", () => {
  const tools = new ToolRegistry();

  test("evaluates supported calculator expressions", () => {
    expect(tools.calculate("2 + 2").result).toBe(4);
    expect(tools.calculate("(10 * 5) + (20 / 4)").result).toBe(55);
    expect(tools.calculate("sqrt(16) + abs(-5)").result).toBe(9);
  });

  test("rejects unsupported calculator identifiers", () => {
    expect(tools.calculate("process.exit()").error).toContain(
      "Unsupported calculator name",
    );
  });

  test("normalizes currency symbols and converts through USD", () => {
    expect(tools.convertCurrency(100, "US$", "EUR")).toMatchObject({
      from_currency: "USD",
      converted_amount: 92,
    });
    expect(tools.convertCurrency(100, "S$", "USD")).toMatchObject({
      from_currency: "SGD",
    });
    expect(tools.convertCurrency(100, "A$", "USD")).toMatchObject({
      from_currency: "AUD",
    });
    expect(tools.convertCurrency(100, "C$", "USD")).toMatchObject({
      from_currency: "CAD",
    });
  });

  test("returns an error for unsupported currencies", () => {
    expect(tools.convertCurrency(100, "XXX", "YYY").error).toContain(
      "Unsupported currency",
    );
    expect(tools.convertCurrency(100, "S$INVALID", "USD").error).toContain(
      "Unsupported currency",
    );
  });

  test("executes isolated JavaScript and captures output and result", () => {
    const result = tools.codeInterpreter(`
      const expenses = [2500000, 2278481.01, 2541806.02];
      const total = expenses.reduce((sum, amount) => sum + amount, 0);
      console.log("Total", total);
      const result = { total, reduced: total * 0.88 };
    `);

    expect(result.success).toBe(true);
    const interpretedResult = result.result as {
      total: number;
      reduced: number;
    };
    expect(interpretedResult.total).toBeCloseTo(7320287.03, 6);
    expect(interpretedResult.reduced).toBeCloseTo(6441852.5864, 6);
    const printedTotal = Number(
      String(result.output).trim().split(/\s+/).at(-1),
    );
    expect(printedTotal).toBeCloseTo(7320287.03, 6);
  });

  test("parses the bundled PDF without network access", async () => {
    const result = await tools.parsePdf(
      path.resolve("fixtures/pdfs/simple_expense_report.pdf"),
    );

    expect(result.error).toBeUndefined();
    expect(result.num_pages).toBeGreaterThan(0);
    expect(result.content).toBeInstanceOf(Array);
  });
});
