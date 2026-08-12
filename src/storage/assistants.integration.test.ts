import { pool } from "../db.js";
import { describe, it, expect } from "vitest";
import {
  getAssistants,
  getAssistantById,
  getAssistantVersions,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  restoreAssistantVersion,
  compareAssistantVersions,
} from "./assistants.js";
import {
  MISSING_ID,
  required,
  versionsOrdered,
  versionNumbers,
  firstVersionOf,
} from "../../test/db-helpers.js";

describe("createAssistant", () => {
  it("inserts an assistant row", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");

    expect(assistant.name).toBe("Test Bot");

    const result = await pool.query("SELECT * FROM assistants");
    const row = required(result.rows[0], "assistant row");

    expect(result.rows).toHaveLength(1);
    expect(row.name).toBe("Test Bot");
    expect(row.instructions).toBe("Be helpful");
  });

  it("creates a first version", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const result = await versionsOrdered(assistant.id);
    const version = required(result.rows[0], "version row");

    expect(result.rows).toHaveLength(1);
    expect(version.version_number).toBe(1);
    expect(version.name).toBe("Test Bot");
    expect(version.instructions).toBe("Be helpful");
  });

  it("points current_version_id at the first version", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const versions = await versionsOrdered(assistant.id);
    const stored = await pool.query("SELECT * FROM assistants WHERE id = $1", [
      assistant.id,
    ]);

    const version = required(versions.rows[0], "version row");
    const row = required(stored.rows[0], "assistant row");

    expect(row.current_version_id).not.toBeNull();
    expect(version.id).toBe(row.current_version_id);
  });
});

describe("updateAssistant", () => {
  it("increments the version number", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Renamed Bot" });

    expect(await versionNumbers(assistant.id)).toEqual([1, 2]);
  });

  it("updates the assistant row itself", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Renamed Bot" });

    const stored = await pool.query("SELECT * FROM assistants WHERE id = $1", [
      assistant.id,
    ]);

    expect(required(stored.rows[0], "assistant row").name).toBe("Renamed Bot");
  });

  it("leaves untouched fields at their previous value", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Renamed Bot" });

    const stored = await pool.query("SELECT * FROM assistants WHERE id = $1", [
      assistant.id,
    ]);

    expect(required(stored.rows[0], "assistant row").instructions).toBe(
      "Be helpful",
    );
  });

  it("keeps old versions immutable when content changes", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { instructions: "Be concise" });

    const result = await versionsOrdered(assistant.id);

    expect(required(result.rows[0], "version 1").instructions).toBe(
      "Be helpful",
    );
    expect(required(result.rows[1], "version 2").instructions).toBe(
      "Be concise",
    );
  });

  it("repoints current_version_id at the newest version", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Renamed Bot" });

    const result = await versionsOrdered(assistant.id);
    const stored = await pool.query("SELECT * FROM assistants WHERE id = $1", [
      assistant.id,
    ]);

    expect(required(stored.rows[0], "assistant row").current_version_id).toBe(
      required(result.rows[1], "version 2").id,
    );
  });

  it("returns the updated assistant", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const updated = await updateAssistant(assistant.id, {
      name: "Renamed Bot",
    });

    expect(required(updated, "updated assistant").name).toBe("Renamed Bot");
  });

  it("returns null when the assistant does not exist", async () => {
    expect(await updateAssistant(MISSING_ID, { name: "Nobody" })).toBeNull();
  });

  it("keeps incrementing across several updates", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Second" });
    await updateAssistant(assistant.id, { name: "Third" });
    await updateAssistant(assistant.id, { name: "Fourth" });

    expect(await versionNumbers(assistant.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("restoreAssistantVersion", () => {
  it("creates a new version rather than deleting history", async () => {
    const assistant = await createAssistant("Original", "Original text");
    await updateAssistant(assistant.id, { name: "Changed" });
    const first = await firstVersionOf(assistant.id);

    await restoreAssistantVersion(assistant.id, first.id);

    // Restore moves history forward instead of rewinding it, which is what
    // keeps the audit trail intact.
    expect(await versionNumbers(assistant.id)).toEqual([1, 2, 3]);
  });

  it("copies the restored version's content into the new version", async () => {
    const assistant = await createAssistant("Original", "Original text");
    await updateAssistant(assistant.id, {
      name: "Changed",
      instructions: "Changed text",
    });
    const first = await firstVersionOf(assistant.id);

    await restoreAssistantVersion(assistant.id, first.id);

    const result = await versionsOrdered(assistant.id);
    const newest = required(result.rows[2], "version 3");

    expect(newest.name).toBe("Original");
    expect(newest.instructions).toBe("Original text");
  });

  it("updates the assistant row to the restored content", async () => {
    const assistant = await createAssistant("Original", "Original text");
    await updateAssistant(assistant.id, { name: "Changed" });
    const first = await firstVersionOf(assistant.id);

    await restoreAssistantVersion(assistant.id, first.id);

    const stored = await pool.query("SELECT * FROM assistants WHERE id = $1", [
      assistant.id,
    ]);

    expect(required(stored.rows[0], "assistant row").name).toBe("Original");
  });

  it("returns a failure reason when the version belongs to another assistant", async () => {
    const assistantA = await createAssistant("A", "A text");
    const assistantB = await createAssistant("B", "B text");
    const versionB = await firstVersionOf(assistantB.id);
    const result = await restoreAssistantVersion(assistantA.id, versionB.id);

    expect(result).toEqual({ ok: false, reason: "version_not_found" });
  });

  it("returns a failure reason when the assistant does not exist", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const first = await firstVersionOf(assistant.id);
    const result = await restoreAssistantVersion(MISSING_ID, first.id);

    expect(result).toEqual({ ok: false, reason: "assistant_not_found" });
  });

  it("returns a failure reason when the assistant does not exist", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const first = await firstVersionOf(assistant.id);
    const result = await restoreAssistantVersion(MISSING_ID, first.id);

    expect(result).toEqual({ ok: false, reason: "assistant_not_found" });
  });
});

describe("getAssistantVersions", () => {
  it("returns versions newest first", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Second" });
    await updateAssistant(assistant.id, { name: "Third" });

    const result = await getAssistantVersions(assistant.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.versions.map((version) => version.version_number)).toEqual([
      3, 2, 1,
    ]);
  });

  it("returns a failure reason for an unknown assistant", async () => {
    const result = await getAssistantVersions(MISSING_ID);

    expect(result).toEqual({ ok: false, reason: "assistant_not_found" });
  });
});

describe("compareAssistantVersions", () => {
  it("reports which fields changed between two versions", async () => {
    const assistant = await createAssistant("Original", "Same text");
    await updateAssistant(assistant.id, { name: "Changed" });

    const versionsResult = await getAssistantVersions(assistant.id);
    if (!versionsResult.ok) throw new Error("Expected the assistant to exist");

    const v1 = required(
      versionsResult.versions.find((version) => version.version_number === 1),
      "version 1",
    );
    const v2 = required(
      versionsResult.versions.find((version) => version.version_number === 2),
      "version 2",
    );
    const comparison = required(
      await compareAssistantVersions(assistant.id, v1.id, v2.id),
      "comparison",
    );

    expect(comparison.changes.name.changed).toBe(true);
    expect(comparison.changes.name.from).toBe("Original");
    expect(comparison.changes.name.to).toBe("Changed");
    expect(comparison.changes.instructions.changed).toBe(false);
  });

  it("returns null when a version does not exist", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const first = await firstVersionOf(assistant.id);

    expect(
      await compareAssistantVersions(assistant.id, first.id, MISSING_ID),
    ).toBeNull();
  });
});

describe("deleteAssistant", () => {
  it("removes the assistant and reports success", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");

    expect(await deleteAssistant(assistant.id)).toBe(true);

    const result = await pool.query("SELECT * FROM assistants");

    expect(result.rows).toHaveLength(0);
  });

  it("cascades to the assistant's versions", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Second" });

    await deleteAssistant(assistant.id);

    const result = await pool.query("SELECT * FROM assistant_versions");

    expect(result.rows).toHaveLength(0);
  });

  it("reports failure when the assistant does not exist", async () => {
    expect(await deleteAssistant(MISSING_ID)).toBe(false);
  });
});

describe("getAssistantById", () => {
  it("returns the assistant when it exists", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const found = await getAssistantById(assistant.id);

    expect(required(found, "assistant").name).toBe("Test Bot");
  });

  it("returns null when it does not exist", async () => {
    expect(await getAssistantById(MISSING_ID)).toBeNull();
  });
});

describe("getAssistants", () => {
  it("returns newest first", async () => {
    await createAssistant("First", "text");
    await createAssistant("Second", "text");
    await createAssistant("Third", "text");

    const assistants = await getAssistants();

    expect(assistants).toHaveLength(3);
    expect(required(assistants[0], "first result").name).toBe("Third");
  });

  it("respects limit and offset", async () => {
    await createAssistant("First", "text");
    await createAssistant("Second", "text");
    await createAssistant("Third", "text");

    expect(await getAssistants(2, 0)).toHaveLength(2);
    expect(await getAssistants(2, 2)).toHaveLength(1);
  });
});
