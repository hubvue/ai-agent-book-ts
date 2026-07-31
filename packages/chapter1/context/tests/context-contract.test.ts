import { describe, expect, test } from "vitest";

import { evaluateContextContract } from "../src/experiment.js";
import {
  ContextMode,
  type ApiTurn,
  type ConversationMessage,
} from "../src/types.js";

const SYSTEM: ConversationMessage = { role: "system", content: "system" };
const USER: ConversationMessage = { role: "user", content: "task" };
const ASSISTANT: ConversationMessage = {
  role: "assistant",
  reasoning_content: "reason",
  tool_calls: [
    {
      id: "call",
      type: "function",
      function: { name: "calculate", arguments: '{"expression":"2+2"}' },
    },
  ],
};
const TOOL: ConversationMessage = {
  role: "tool",
  tool_call_id: "call",
  content: '{"result":4}',
};

describe("Experiment 1-1 context contract", () => {
  test("accepts full follow-up context", () => {
    const result = evaluateContextContract(ContextMode.FULL, [
      turn([SYSTEM, USER]),
      turn([SYSTEM, USER, ASSISTANT, TOOL]),
    ]);
    expect(result.passed).toBe(true);
  });

  test("rejects a sliding window as no-history", () => {
    expect(
      evaluateContextContract(ContextMode.NO_HISTORY, [
        turn([SYSTEM, USER]),
        turn([SYSTEM, USER]),
      ]).passed,
    ).toBe(true);
    expect(
      evaluateContextContract(ContextMode.NO_HISTORY, [
        turn([SYSTEM, USER]),
        turn([SYSTEM, USER, ASSISTANT, TOOL]),
      ]).passed,
    ).toBe(false);
  });

  test("requires provider reasoning but strips it from later requests", () => {
    const strippedAssistant = { ...ASSISTANT };
    delete strippedAssistant.reasoning_content;
    const result = evaluateContextContract(ContextMode.NO_REASONING, [
      turn([SYSTEM, USER]),
      turn([SYSTEM, USER, strippedAssistant, TOOL]),
    ]);
    expect(result.passed).toBe(true);
  });

  test("requires literal hidden tool observations", () => {
    const hiddenTool: ConversationMessage = {
      role: "tool",
      tool_call_id: "call",
      content: "[Tool result hidden due to context mode]",
    };
    expect(
      evaluateContextContract(ContextMode.NO_TOOL_RESULTS, [
        turn([SYSTEM, USER]),
        turn([SYSTEM, USER, ASSISTANT, hiddenTool]),
      ]).passed,
    ).toBe(true);
    expect(
      evaluateContextContract(ContextMode.NO_TOOL_RESULTS, [
        turn([SYSTEM, USER]),
        turn([SYSTEM, USER, ASSISTANT, TOOL]),
      ]).passed,
    ).toBe(false);
  });

  test("requires tool fields to be absent", () => {
    expect(
      evaluateContextContract(ContextMode.NO_TOOL_CALLS, [
        turn([SYSTEM, USER], { includeTools: false }),
      ]).passed,
    ).toBe(true);
  });

  test("negative control catches a missing full-context tool result", () => {
    const invalidFullContext = evaluateContextContract(ContextMode.FULL, [
      turn([SYSTEM, USER]),
      turn([SYSTEM, USER, ASSISTANT]),
    ]);
    expect(invalidFullContext.passed).toBe(false);
    expect(invalidFullContext.history_present_after_first_turn).toBe(false);
  });
});

function turn(
  messages: ConversationMessage[],
  options: { includeTools?: boolean; reasoning?: string } = {},
): ApiTurn {
  const includeTools = options.includeTools ?? true;
  return {
    iteration: 1,
    provider: "test",
    resolved_model: "test-model",
    base_url: "https://example.test/v1",
    using_openrouter: false,
    request: {
      model: "test-model",
      messages,
      temperature: 0.3,
      max_tokens: 100,
      ...(includeTools
        ? {
            tools: [
              {
                type: "function" as const,
                function: {
                  name: "calculate",
                  description: "calculate",
                  parameters: {
                    type: "object" as const,
                    properties: {},
                    required: [],
                  },
                },
              },
            ],
            tool_choice: "auto" as const,
          }
        : {}),
    },
    response: {
      id: "real-response-id",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            reasoning_content: options.reasoning ?? "reason",
          },
        },
      ],
    },
  };
}
