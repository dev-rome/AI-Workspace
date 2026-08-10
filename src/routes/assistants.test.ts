import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildApp } from "../app.js";

// Replace the whole storage module with auto-generated mock functions, so
// these tests exercise routing, validation, and error handling with no
// database. vi.mock is hoisted above the imports, so by the time buildApp
// pulls in the routes, they already see the mocked storage layer.
vi.mock("../storage/assistants.js");

import * as storage from "../storage/assistants.js";

const app = buildApp({ logger: false });

describe("assistant routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects a malformed id before reaching storage", async () => {
    // app.inject sends a request through the full app in memory, no port,
    // no network. It returns the response for you to assert on.
    const response = await app.inject({
      method: "GET",
      url: "/assistants/not-a-uuid",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid request",
      message: "id must be a valid UUID",
    });
    // Validation runs before the handler, so the DB layer is never called.
    expect(storage.getAssistantById).not.toHaveBeenCalled();
  });

  it("returns a 404 in the standard shape when the assistant is missing", async () => {
    vi.mocked(storage.getAssistantById).mockResolvedValue(null);

    const response = await app.inject({
      method: "GET",
      url: "/assistants/11111111-1111-1111-1111-111111111111",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Not Found",
      message: "Assistant not found",
    });
  });

  it("returns the assistant on a hit", async () => {
    const assistant = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Support Bot",
      instructions: "Be helpful",
      current_version_id: "22222222-2222-2222-2222-222222222222",
      created_at: new Date("2026-01-01T00:00:00Z"),
    };
    vi.mocked(storage.getAssistantById).mockResolvedValue(assistant);

    const response = await app.inject({
      method: "GET",
      url: `/assistants/${assistant.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: "Support Bot" });
  });

  it("rejects a create that is missing a required field", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: { name: "No instructions here" },
    });

    expect(response.statusCode).toBe(400);
    expect(storage.createAssistant).not.toHaveBeenCalled();
  });

  it("creates an assistant and returns 201", async () => {
    const created = {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Sales Bot",
      instructions: "Sell things",
      current_version_id: null,
      created_at: new Date(),
    };
    vi.mocked(storage.createAssistant).mockResolvedValue(created);

    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: { name: "Sales Bot", instructions: "Sell things" },
    });

    expect(response.statusCode).toBe(201);
    expect(storage.createAssistant).toHaveBeenCalledWith(
      "Sales Bot",
      "Sell things",
    );
  });
});
