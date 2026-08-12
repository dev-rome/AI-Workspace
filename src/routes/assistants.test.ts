import { describe, it, expect, afterAll, vi } from "vitest";
import { buildApp } from "../app.js";
import { ASSISTANT_ID, makeAssistant } from "../../test/factories.js";

vi.mock("../storage/assistants.js");

import * as storage from "../storage/assistants.js";

const app = buildApp({ logger: false });

afterAll(async () => {
  await app.close();
});

describe("GET /assistants", () => {
  it("returns the list and applies pagination defaults", async () => {
    vi.mocked(storage.getAssistants).mockResolvedValue([makeAssistant()]);

    const response = await app.inject({
      method: "GET",
      url: "/assistants",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(storage.getAssistants).toHaveBeenCalledWith(50, 0);
  });

  it("passes pagination values as numbers", async () => {
    vi.mocked(storage.getAssistants).mockResolvedValue([]);

    const response = await app.inject({
      method: "GET",
      url: "/assistants?limit=20&offset=40",
    });

    expect(response.statusCode).toBe(200);
    expect(storage.getAssistants).toHaveBeenCalledWith(20, 40);
  });

  it("rejects a non-numeric limit", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/assistants?limit=abc",
    });

    expect(response.statusCode).toBe(400);
    expect(storage.getAssistants).not.toHaveBeenCalled();
  });

  it("rejects a limit above the maximum", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/assistants?limit=500",
    });

    expect(response.statusCode).toBe(400);
    expect(storage.getAssistants).not.toHaveBeenCalled();
  });
});

describe("GET /assistants/:id", () => {
  it("rejects a malformed id before reaching storage", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/assistants/not-a-uuid",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid request",
      message: "id must be a valid UUID",
    });
    expect(storage.getAssistantById).not.toHaveBeenCalled();
  });

  it("returns 404 when the assistant does not exist", async () => {
    vi.mocked(storage.getAssistantById).mockResolvedValue(null);

    const response = await app.inject({
      method: "GET",
      url: `/assistants/${ASSISTANT_ID}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Not Found",
      message: "Assistant not found",
    });
  });

  it("returns the assistant when found", async () => {
    vi.mocked(storage.getAssistantById).mockResolvedValue(makeAssistant());

    const response = await app.inject({
      method: "GET",
      url: `/assistants/${ASSISTANT_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "Support Bot",
      instructions: "Be helpful",
    });
    expect(storage.getAssistantById).toHaveBeenCalledWith(ASSISTANT_ID);
  });
});

describe("POST /assistants", () => {
  it("rejects a request missing a required field", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: { name: "No instructions here" },
    });

    expect(response.statusCode).toBe(400);
    expect(storage.createAssistant).not.toHaveBeenCalled();
  });

  it("rejects an empty required field", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: {
        name: "",
        instructions: "Be helpful",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(storage.createAssistant).not.toHaveBeenCalled();
  });

  it("rejects an unsupported field", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: {
        name: "Bot",
        instructions: "Help",
        role: "admin",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid request",
      message: "Request body contains an unsupported field",
    });
    expect(storage.createAssistant).not.toHaveBeenCalled();
  });

  it("creates an assistant and returns 201", async () => {
    vi.mocked(storage.createAssistant).mockResolvedValue(
      makeAssistant({
        name: "Sales Bot",
        instructions: "Sell things",
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: {
        name: "Sales Bot",
        instructions: "Sell things",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: "Sales Bot",
      instructions: "Sell things",
    });
    expect(storage.createAssistant).toHaveBeenCalledWith(
      "Sales Bot",
      "Sell things",
    );
  });

  it("rejects a whitespace-only name", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: { name: "   ", instructions: "Be helpful" },
    });

    expect(response.statusCode).toBe(400);
    expect(storage.createAssistant).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before storing", async () => {
    vi.mocked(storage.createAssistant).mockResolvedValue(makeAssistant());

    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: { name: "  Support Bot  ", instructions: "  Be helpful  " },
    });

    expect(response.statusCode).toBe(201);
    expect(storage.createAssistant).toHaveBeenCalledWith(
      "Support Bot",
      "Be helpful",
    );
  });

  it("rejects a name longer than the maximum", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: { name: "a".repeat(201), instructions: "Be helpful" },
    });

    expect(response.statusCode).toBe(400);
    expect(storage.createAssistant).not.toHaveBeenCalled();
  });

  it("rejects instructions longer than the maximum", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: { name: "Support Bot", instructions: "a".repeat(10001) },
    });

    expect(response.statusCode).toBe(400);
    expect(storage.createAssistant).not.toHaveBeenCalled();
  });
});

describe("PATCH /assistants/:id", () => {
  it("rejects an empty body", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/assistants/${ASSISTANT_ID}`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid request",
      message: "Request body must contain at least one field",
    });
    expect(storage.updateAssistant).not.toHaveBeenCalled();
  });

  it("rejects an unsupported field", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/assistants/${ASSISTANT_ID}`,
      payload: {
        name: "Renamed",
        role: "admin",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid request",
      message: "Request body contains an unsupported field",
    });
    expect(storage.updateAssistant).not.toHaveBeenCalled();
  });

  it("accepts a partial update", async () => {
    vi.mocked(storage.updateAssistant).mockResolvedValue(
      makeAssistant({ name: "Renamed" }),
    );

    const response = await app.inject({
      method: "PATCH",
      url: `/assistants/${ASSISTANT_ID}`,
      payload: { name: "Renamed" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "Renamed",
    });
    expect(storage.updateAssistant).toHaveBeenCalledWith(ASSISTANT_ID, {
      name: "Renamed",
    });
  });

  it("returns 404 when the assistant does not exist", async () => {
    vi.mocked(storage.updateAssistant).mockResolvedValue(null);

    const response = await app.inject({
      method: "PATCH",
      url: `/assistants/${ASSISTANT_ID}`,
      payload: { name: "Renamed" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Not Found",
      message: "Assistant not found",
    });
  });

  it("rejects a whitespace-only name", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/assistants/${ASSISTANT_ID}`,
      payload: { name: "   " },
    });

    expect(response.statusCode).toBe(400);
    expect(storage.updateAssistant).not.toHaveBeenCalled();
  });
});

describe("DELETE /assistants/:id", () => {
  it("returns 204 with no body on success", async () => {
    vi.mocked(storage.deleteAssistant).mockResolvedValue(true);

    const response = await app.inject({
      method: "DELETE",
      url: `/assistants/${ASSISTANT_ID}`,
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(storage.deleteAssistant).toHaveBeenCalledWith(ASSISTANT_ID);
  });

  it("returns 404 when the assistant does not exist", async () => {
    vi.mocked(storage.deleteAssistant).mockResolvedValue(false);

    const response = await app.inject({
      method: "DELETE",
      url: `/assistants/${ASSISTANT_ID}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Not Found",
      message: "Assistant not found",
    });
  });
});

describe("error handling", () => {
  it("returns 503 when the database is unreachable", async () => {
    const dbError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });

    vi.mocked(storage.getAssistants).mockRejectedValue(dbError);

    const response = await app.inject({ method: "GET", url: "/assistants" });

    expect(response.statusCode).toBe(503);
  });

  it("returns 409 on a unique constraint violation", async () => {
    const dbError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });

    vi.mocked(storage.createAssistant).mockRejectedValue(dbError);

    const response = await app.inject({
      method: "POST",
      url: "/assistants",
      payload: { name: "Bot", instructions: "Help" },
    });

    expect(response.statusCode).toBe(409);
  });
});
