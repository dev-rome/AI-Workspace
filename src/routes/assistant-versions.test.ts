import { describe, it, expect, afterAll, vi } from "vitest";
import { buildApp } from "../app.js";
import {
  ASSISTANT_ID,
  VERSION_A_ID,
  VERSION_B_ID,
  makeAssistant,
  makeVersion,
} from "../../test/factories.js";

vi.mock("../storage/assistants.js");

import * as storage from "../storage/assistants.js";

const app = await buildApp({ logger: false });

afterAll(async () => {
  await app.close();
});

describe("GET /assistants/:id/versions", () => {
  it("returns 404 when the assistant does not exist", async () => {
    vi.mocked(storage.getAssistantVersions).mockResolvedValue({
      ok: false,
      reason: "assistant_not_found",
    });

    const response = await app.inject({
      method: "GET",
      url: `/assistants/${ASSISTANT_ID}/versions`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Not Found",
      message: "Assistant not found",
    });
  });

  it("returns the version history", async () => {
    vi.mocked(storage.getAssistantVersions).mockResolvedValue({
      ok: true,
      versions: [
        makeVersion({ id: VERSION_B_ID, version_number: 2 }),
        makeVersion({ id: VERSION_A_ID, version_number: 1 }),
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: `/assistants/${ASSISTANT_ID}/versions`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    expect(storage.getAssistantVersions).toHaveBeenCalledWith(ASSISTANT_ID);
  });
});

describe("POST /assistants/:id/versions/:versionId/restore", () => {
  it("rejects a malformed version id", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/assistants/${ASSISTANT_ID}/versions/not-a-uuid/restore`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid request",
      message: "versionId must be a valid UUID",
    });
    expect(storage.restoreAssistantVersion).not.toHaveBeenCalled();
  });

  it("returns a distinct 404 when the assistant is missing", async () => {
    vi.mocked(storage.restoreAssistantVersion).mockResolvedValue({
      ok: false,
      reason: "assistant_not_found",
    });

    const response = await app.inject({
      method: "POST",
      url: `/assistants/${ASSISTANT_ID}/versions/${VERSION_A_ID}/restore`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Not Found",
      message: "Assistant not found",
    });
  });

  it("returns a distinct 404 when the version is missing", async () => {
    vi.mocked(storage.restoreAssistantVersion).mockResolvedValue({
      ok: false,
      reason: "version_not_found",
    });

    const response = await app.inject({
      method: "POST",
      url: `/assistants/${ASSISTANT_ID}/versions/${VERSION_A_ID}/restore`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Not Found",
      message: "Version not found for this assistant",
    });
  });

  it("restores a version and returns the updated assistant", async () => {
    vi.mocked(storage.restoreAssistantVersion).mockResolvedValue({
      ok: true,
      assistant: makeAssistant({ name: "Restored Name" }),
    });

    const response = await app.inject({
      method: "POST",
      url: `/assistants/${ASSISTANT_ID}/versions/${VERSION_A_ID}/restore`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: "Restored Name" });
    expect(storage.restoreAssistantVersion).toHaveBeenCalledWith(
      ASSISTANT_ID,
      VERSION_A_ID,
    );
  });
});

describe("GET /assistants/:assistantId/versions/:a/compare/:b", () => {
  it("returns 404 when either version is missing", async () => {
    vi.mocked(storage.compareAssistantVersions).mockResolvedValue(null);

    const response = await app.inject({
      method: "GET",
      url: `/assistants/${ASSISTANT_ID}/versions/${VERSION_A_ID}/compare/${VERSION_B_ID}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Not Found",
      message: "One or both versions were not found for this assistant",
    });
  });

  it("returns the comparison with a changes diff", async () => {
    vi.mocked(storage.compareAssistantVersions).mockResolvedValue({
      versionA: makeVersion({
        id: VERSION_A_ID,
        version_number: 1,
        name: "Support Bot",
      }),
      versionB: makeVersion({
        id: VERSION_B_ID,
        version_number: 2,
        name: "Renamed",
      }),
      changes: {
        name: { changed: true, from: "Support Bot", to: "Renamed" },
        instructions: {
          changed: false,
          from: "Be helpful",
          to: "Be helpful",
        },
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/assistants/${ASSISTANT_ID}/versions/${VERSION_A_ID}/compare/${VERSION_B_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      changes: {
        name: { changed: true, from: "Support Bot", to: "Renamed" },
        instructions: { changed: false },
      },
    });
    expect(storage.compareAssistantVersions).toHaveBeenCalledWith(
      ASSISTANT_ID,
      VERSION_A_ID,
      VERSION_B_ID,
    );
  });
});
