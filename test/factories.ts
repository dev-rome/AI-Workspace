// Shared test data builders and fixed IDs.
//
// Factories return a fresh object on every call so no test can mutate data
// another test depends on. Only DATA lives here: assertions and control flow
// stay in the test files where a failure is readable at the point it happens.

import {
  type Assistant,
  type AssistantVersion,
} from "../src/types/assistant.js";

export const ASSISTANT_ID = "11111111-1111-1111-1111-111111111111";
export const VERSION_A_ID = "22222222-2222-2222-2222-222222222222";
export const VERSION_B_ID = "33333333-3333-3333-3333-333333333333";

export function makeAssistant(overrides: Partial<Assistant> = {}): Assistant {
  return {
    id: ASSISTANT_ID,
    name: "Support Bot",
    instructions: "Be helpful",
    current_version_id: VERSION_A_ID,
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function makeVersion(
  overrides: Partial<AssistantVersion> = {},
): AssistantVersion {
  return {
    id: VERSION_A_ID,
    assistant_id: ASSISTANT_ID,
    version_number: 1,
    name: "Support Bot",
    instructions: "Be helpful",
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}
