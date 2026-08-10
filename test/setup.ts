import { afterEach, vi } from "vitest";

// Runs before every test file. Put cross-cutting test lifecycle here so
// individual test files only contain their own assertions.

afterEach(() => {
  // Clear call history and implementations between tests so state from one
  // test never leaks into the next.
  vi.resetAllMocks();
  // Put back any real methods replaced with vi.spyOn. resetAllMocks alone
  // does not restore originals, which causes cross-file bleed.
  vi.restoreAllMocks();
});
