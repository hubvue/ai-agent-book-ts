#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import PDFDocument from "pdfkit";

export async function createSamplePdfs(
  outputDirectory = "fixtures/pdfs",
): Promise<string[]> {
  await mkdir(outputDirectory, { recursive: true });
  const financialReportPath = path.join(
    outputDirectory,
    "sample_financial_report_q1_2024.pdf",
  );
  const expenseReportPath = path.join(
    outputDirectory,
    "simple_expense_report.pdf",
  );
  await Promise.all([
    writeFinancialReport(financialReportPath),
    writeExpenseReport(expenseReportPath),
  ]);
  return [financialReportPath, expenseReportPath];
}

async function writeFinancialReport(filePath: string): Promise<void> {
  await writePdf(filePath, (document) => {
    document.fontSize(24).fillColor("#1f4788").text(
      "Global Corporation Financial Report",
      { align: "center" },
    );
    document.fontSize(16).fillColor("#111827").text(
      "Q1 2024 - Quarterly Results",
      { align: "center" },
    );
    document.moveDown();
    document.fontSize(16).fillColor("#1f4788").text("Executive Summary");
    document.fontSize(11).fillColor("#111827").text(
      "Total consolidated revenue for Q1 2024 reached $45.8 million USD, representing a 12% increase year-over-year.",
    );
    document.moveDown();
    document.fontSize(16).fillColor("#1f4788").text(
      "Regional Revenue Breakdown",
    );
    document.fontSize(11).fillColor("#111827").text(
      [
        "North America — USD — $15,250,000",
        "Europe — EUR — €11,340,000",
        "United Kingdom — GBP — £8,920,000",
        "Asia Pacific — JPY — ¥1,245,000,000",
        "Singapore — SGD — S$4,180,000",
      ].join("\n"),
    );
    document.moveDown();
    document.fontSize(16).fillColor("#1f4788").text(
      "Currency Exchange Rates (March 31, 2024)",
    );
    document.fontSize(11).fillColor("#111827").text(
      "USD/EUR 0.9234\nUSD/GBP 0.7891\nUSD/JPY 149.85\nUSD/SGD 1.3452",
    );
  });
}

async function writeExpenseReport(filePath: string): Promise<void> {
  await writePdf(filePath, (document) => {
    document.fontSize(24).text("Quarterly Expense Report", {
      align: "center",
    });
    document.moveDown();
    document.fontSize(16).text("Q1 2024 Regional Expenses");
    document.moveDown(0.5);
    document.fontSize(11).text(
      [
        "United States Office: $2,500,000 USD",
        "United Kingdom Office: £1,800,000 GBP",
        "Japan Office: ¥380,000,000 JPY",
        "European Union Office: €2,100,000 EUR",
        "Singapore Office: S$3,200,000 SGD",
        "",
        "Total headcount: 1,250 employees globally",
        "Projected Q2 expense reduction target: 8% across all regions",
      ].join("\n"),
    );
  });
}

async function writePdf(
  filePath: string,
  render: (document: PDFKit.PDFDocument) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const document = new PDFDocument({ margin: 54 });
    const output = createWriteStream(filePath);
    output.on("finish", resolve);
    output.on("error", reject);
    document.on("error", reject);
    document.pipe(output);
    render(document);
    document.end();
  });
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  const generatedFiles = await createSamplePdfs();
  console.log(`Created sample PDFs:\n${generatedFiles.join("\n")}`);
}
