import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import {
  validateExperiment,
  type ExperimentPayload,
} from "../src/experiment.js";

const BASELINE_DIRECTORY = new URL(
  "../validation/python-baseline/real_20260729T163623Z/",
  import.meta.url,
);

describe("preserved Python Experiment 1-2 baseline", () => {
  test("passes the migrated TypeScript Judge", async () => {
    const evidence = JSON.parse(
      await readFile(new URL("evidence.json", BASELINE_DIRECTORY), "utf8"),
    );
    const migrated = validateExperiment(evidence.run as ExperimentPayload);

    expect(evidence.acceptance.passed).toBe(true);
    expect(migrated.passed).toBe(true);
    expect(migrated.checks).toEqual(evidence.acceptance.checks);
  });

  test("retains the source SHA-256 receipt", async () => {
    const evidence = await readFile(new URL("evidence.json", BASELINE_DIRECTORY));
    const receipt = await readFile(
      new URL("evidence.sha256", BASELINE_DIRECTORY),
      "utf8",
    );
    const digest = createHash("sha256").update(evidence).digest("hex");
    expect(receipt.trim()).toBe(`${digest}  evidence.json`);
  });
});
