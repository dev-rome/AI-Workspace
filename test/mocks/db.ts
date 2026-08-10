import { vi } from "vitest";

// Stand-in for the real db module. Aliased in vitest.config.ts so no test
// ever constructs a real Pool, which would open a Postgres connection and
// hold the event loop open (the classic "test timed out in 5000ms" hang).
const client = {
  query: vi.fn(),
  release: vi.fn(),
};

export const pool = {
  query: vi.fn(),
  connect: vi.fn(async () => client),
};

// Exposed so a test can assert on transaction-level calls if needed.
export const __client = client;