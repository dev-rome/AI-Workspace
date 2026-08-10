import { vi } from "vitest";

const client = {
  query: vi.fn(),
  release: vi.fn(),
};

export const pool = {
  query: vi.fn(),
  connect: vi.fn(async () => client),
};

export const __client = client;
