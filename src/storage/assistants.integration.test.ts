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

const MISSING_ID = "00000000-0000-0000-0000-000000000000";

// Narrows a value the test knows must exist. In production code a thrown
// error is a failure to avoid; in a test it IS the failure signal, and the
// message points at the setup that did not produce what the test assumed.
function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${label} to exist`);
  }
  return value;
}

describe("createAssistant", () => {
  it("inserts an assistant row", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");

    expect(assistant.name).toBe("Test Bot");

    const result = await pool.query("SELECT * FROM assistants");

    expect(result.rows).toHaveLength(1);
    expect(required(result.rows[0], "assistant row").name).toBe("Test Bot");
    expect(required(result.rows[0], "assistant row").instructions).toBe(
      "Be helpful",
    );
  });

  it("creates a first version", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const result = await pool.query(
      "SELECT * FROM assistant_versions WHERE assistant_id = $1",
      [assistant.id],
    );
    const version = required(result.rows[0], "version row");

    expect(result.rows).toHaveLength(1);
    expect(version.version_number).toBe(1);
    expect(version.name).toBe("Test Bot");
    expect(version.instructions).toBe("Be helpful");
  });

  it("points current_version_id at the first version", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const versions = await pool.query(
      "SELECT * FROM assistant_versions WHERE assistant_id = $1",
      [assistant.id],
    );
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
  // ORDER BY is required wherever a test indexes into rows. Without it
  // Postgres makes no promise about order and the test is non-deterministic.
  const versionsOrdered = (assistantId: string) =>
    pool.query(
      `SELECT * FROM assistant_versions
       WHERE assistant_id = $1
       ORDER BY version_number`,
      [assistantId],
    );

  it("increments the version number", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Renamed Bot" });

    const result = await versionsOrdered(assistant.id);

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.version_number)).toEqual([1, 2]);
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
    const newest = required(result.rows[1], "version 2");

    expect(required(stored.rows[0], "assistant row").current_version_id).toBe(
      newest.id,
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
    const result = await updateAssistant(MISSING_ID, { name: "Nobody" });

    expect(result).toBeNull();
  });

  it("keeps incrementing across several updates", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Second" });
    await updateAssistant(assistant.id, { name: "Third" });
    await updateAssistant(assistant.id, { name: "Fourth" });

    const result = await versionsOrdered(assistant.id);

    expect(result.rows.map((row) => row.version_number)).toEqual([1, 2, 3, 4]);
  });
});

describe("restoreAssistantVersion", () => {
  async function firstVersionOf(assistantId: string) {
    const versions = await getAssistantVersions(assistantId);
    return required(
      versions.find((version) => version.version_number === 1),
      "version 1",
    );
  }

  it("creates a new version rather than deleting history", async () => {
    const assistant = await createAssistant("Original", "Original text");
    await updateAssistant(assistant.id, { name: "Changed" });
    const firstVersion = await firstVersionOf(assistant.id);

    await restoreAssistantVersion(assistant.id, firstVersion.id);

    const result = await pool.query(
      `SELECT version_number FROM assistant_versions
       WHERE assistant_id = $1
       ORDER BY version_number`,
      [assistant.id],
    );

    // Restore moves history forward instead of rewinding it, which is what
    // keeps the audit trail intact.
    expect(result.rows.map((row) => row.version_number)).toEqual([1, 2, 3]);
  });

  it("copies the restored version's content into the new version", async () => {
    const assistant = await createAssistant("Original", "Original text");
    await updateAssistant(assistant.id, {
      name: "Changed",
      instructions: "Changed text",
    });
    const firstVersion = await firstVersionOf(assistant.id);

    await restoreAssistantVersion(assistant.id, firstVersion.id);

    const result = await pool.query(
      `SELECT * FROM assistant_versions
       WHERE assistant_id = $1
       ORDER BY version_number DESC
       LIMIT 1`,
      [assistant.id],
    );
    const newest = required(result.rows[0], "newest version");

    expect(newest.name).toBe("Original");
    expect(newest.instructions).toBe("Original text");
  });

  it("updates the assistant row to the restored content", async () => {
    const assistant = await createAssistant("Original", "Original text");
    await updateAssistant(assistant.id, { name: "Changed" });
    const firstVersion = await firstVersionOf(assistant.id);

    await restoreAssistantVersion(assistant.id, firstVersion.id);

    const stored = await pool.query("SELECT * FROM assistants WHERE id = $1", [
      assistant.id,
    ]);

    expect(required(stored.rows[0], "assistant row").name).toBe("Original");
  });

  it("returns null when the version belongs to another assistant", async () => {
    const assistantA = await createAssistant("A", "A text");
    const assistantB = await createAssistant("B", "B text");
    const versionB = await firstVersionOf(assistantB.id);

    // A real version id, but owned by someone else. This check becomes a
    // security boundary once assistants are scoped to users.
    const result = await restoreAssistantVersion(assistantA.id, versionB.id);

    expect(result).toBeNull();
  });

  it("returns null when the version does not exist", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const result = await restoreAssistantVersion(assistant.id, MISSING_ID);

    expect(result).toBeNull();
  });
});

describe("getAssistantVersions", () => {
  it("returns versions newest first", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Second" });
    await updateAssistant(assistant.id, { name: "Third" });

    const versions = await getAssistantVersions(assistant.id);

    expect(versions.map((version) => version.version_number)).toEqual([
      3, 2, 1,
    ]);
  });

  it("returns an empty array for an unknown assistant", async () => {
    const versions = await getAssistantVersions(MISSING_ID);

    expect(versions).toEqual([]);
  });
});

describe("compareAssistantVersions", () => {
  it("reports which fields changed between two versions", async () => {
    const assistant = await createAssistant("Original", "Same text");
    await updateAssistant(assistant.id, { name: "Changed" });

    const versions = await getAssistantVersions(assistant.id);
    const v1 = required(
      versions.find((version) => version.version_number === 1),
      "version 1",
    );
    const v2 = required(
      versions.find((version) => version.version_number === 2),
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
    const versions = await getAssistantVersions(assistant.id);
    const existing = required(versions[0], "version 1");
    const comparison = await compareAssistantVersions(
      assistant.id,
      existing.id,
      MISSING_ID,
    );

    expect(comparison).toBeNull();
  });
});

describe("deleteAssistant", () => {
  it("removes the assistant and reports success", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const deleted = await deleteAssistant(assistant.id);

    expect(deleted).toBe(true);

    const result = await pool.query("SELECT * FROM assistants");

    expect(result.rows).toHaveLength(0);
  });

  it("cascades to the assistant's versions", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    await updateAssistant(assistant.id, { name: "Second" });

    await deleteAssistant(assistant.id);

    // Nothing in the application code deletes version rows. ON DELETE CASCADE
    // does it, so this proves the constraint is doing the work.
    const result = await pool.query("SELECT * FROM assistant_versions");

    expect(result.rows).toHaveLength(0);
  });

  it("reports failure when the assistant does not exist", async () => {
    const deleted = await deleteAssistant(MISSING_ID);

    expect(deleted).toBe(false);
  });
});

describe("getAssistantById", () => {
  it("returns the assistant when it exists", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const found = await getAssistantById(assistant.id);

    expect(required(found, "assistant").name).toBe("Test Bot");
  });

  it("returns null when it does not exist", async () => {
    const found = await getAssistantById(MISSING_ID);

    expect(found).toBeNull();
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

describe("database constraints", () => {
  it("rejects a duplicate version number for the same assistant", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");

    // The UNIQUE (assistant_id, version_number) constraint is the backstop
    // that protects version numbering when two updates race. Nothing in the
    // application layer rejects this insert.
    await expect(
      pool.query(
        `INSERT INTO assistant_versions
           (assistant_id, version_number, name, instructions)
         VALUES ($1, $2, $3, $4)`,
        [assistant.id, 1, "Duplicate", "Duplicate"],
      ),
    ).rejects.toThrow();
  });
});

describe("concurrency", () => {
  it("assigns unique sequential version numbers under concurrent updates", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");

    await Promise.all([
      updateAssistant(assistant.id, { name: "One" }),
      updateAssistant(assistant.id, { name: "Two" }),
      updateAssistant(assistant.id, { name: "Three" }),
      updateAssistant(assistant.id, { name: "Four" }),
      updateAssistant(assistant.id, { name: "Five" }),
    ]);

    const result = await pool.query(
      `SELECT version_number FROM assistant_versions
       WHERE assistant_id = $1
       ORDER BY version_number`,
      [assistant.id],
    );

    expect(result.rows.map((row) => row.version_number)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});
