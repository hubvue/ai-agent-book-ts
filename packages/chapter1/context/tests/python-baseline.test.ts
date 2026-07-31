import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

import { evaluateContextContract } from "../src/experiment.js";
import {
  ContextMode,
  type ApiTurn,
} from "../src/types.js";

test("the TypeScript Judge accepts every preserved Python real-API arm", async () => {
  const evidence = JSON.parse(
    await readFile("validation/python-baseline/latest.json", "utf8"),
  ) as {
    analysis: { experiment_execution_accepted: boolean };
    arms: Array<{ mode: ContextMode; api_turns: ApiTurn[] }>;
  };

  expect(evidence.analysis.experiment_execution_accepted).toBe(true);
  expect(evidence.arms.map((arm) => arm.mode)).toEqual([
    ContextMode.FULL,
    ContextMode.NO_HISTORY,
    ContextMode.NO_REASONING,
    ContextMode.NO_TOOL_CALLS,
    ContextMode.NO_TOOL_RESULTS,
  ]);
  for (const arm of evidence.arms) {
    expect(
      evaluateContextContract(arm.mode, arm.api_turns).passed,
      `${arm.mode} should satisfy the migrated contract`,
    ).toBe(true);
  }
});
