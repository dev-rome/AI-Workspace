import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db.js";
import {
  createAssistant,
  updateAssistant,
  restoreAssistantVersion,
} from "./assistants.js";
import {
  MISSING_ID,
  required,
  versionsOrdered,
  versionNumbers,
  firstVersionOf,
} from "../../test/db-helpers.js";

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

  it("rejects a version whose assistant does not exist", async () => {
    await expect(
      pool.query(
        `INSERT INTO assistant_versions
           (assistant_id, version_number, name, instructions)
         VALUES ($1, $2, $3, $4)`,
        [MISSING_ID, 1, "Orphan", "Orphan"],
      ),
    ).rejects.toThrow();
  });

  it("refuses to delete a version that an assistant currently points at", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");
    const first = await firstVersionOf(assistant.id);

    await expect(
      pool.query("DELETE FROM assistant_versions WHERE id = $1", [first.id]),
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

    expect(await versionNumbers(assistant.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("leaves current_version_id pointing at the newest version", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");

    await Promise.all([
      updateAssistant(assistant.id, { name: "One" }),
      updateAssistant(assistant.id, { name: "Two" }),
      updateAssistant(assistant.id, { name: "Three" }),
      updateAssistant(assistant.id, { name: "Four" }),
      updateAssistant(assistant.id, { name: "Five" }),
    ]);

    const stored = await pool.query("SELECT * FROM assistants WHERE id = $1", [
      assistant.id,
    ]);
    const result = await versionsOrdered(assistant.id);

    expect(required(stored.rows[0], "assistant").current_version_id).toBe(
      required(result.rows[5], "version 6").id,
    );
  });

  it("assigns unique version numbers under concurrent restores", async () => {
    const assistant = await createAssistant("Original", "Original text");
    await updateAssistant(assistant.id, { name: "Changed" });
    const first = await firstVersionOf(assistant.id);

    await Promise.all([
      restoreAssistantVersion(assistant.id, first.id),
      restoreAssistantVersion(assistant.id, first.id),
      restoreAssistantVersion(assistant.id, first.id),
      restoreAssistantVersion(assistant.id, first.id),
    ]);

    expect(await versionNumbers(assistant.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("assigns unique version numbers when updates and restores interleave", async () => {
    const assistant = await createAssistant("Original", "Original text");
    await updateAssistant(assistant.id, { name: "Changed" });
    const first = await firstVersionOf(assistant.id);

    await Promise.all([
      updateAssistant(assistant.id, { name: "Update A" }),
      restoreAssistantVersion(assistant.id, first.id),
      updateAssistant(assistant.id, { name: "Update B" }),
      restoreAssistantVersion(assistant.id, first.id),
    ]);

    expect(await versionNumbers(assistant.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps separate assistants independent under concurrent load", async () => {
    const assistantA = await createAssistant("A", "A text");
    const assistantB = await createAssistant("B", "B text");

    await Promise.all([
      updateAssistant(assistantA.id, { name: "A1" }),
      updateAssistant(assistantB.id, { name: "B1" }),
      updateAssistant(assistantA.id, { name: "A2" }),
      updateAssistant(assistantB.id, { name: "B2" }),
    ]);

    expect(await versionNumbers(assistantA.id)).toEqual([1, 2, 3]);
    expect(await versionNumbers(assistantB.id)).toEqual([1, 2, 3]);
  });
});

describe("transaction rollback", () => {
  // A CHECK constraint that rejects one specific name. updateAssistant writes
  // the assistants row BEFORE inserting the version, so a version insert that
  // violates this constraint proves the earlier write is rolled back rather
  // than left behind.
  //
  // The constraint applies to the whole table, which is safe only because
  // integration tests run with fileParallelism disabled.
  beforeAll(async () => {
    await pool.query(`
      ALTER TABLE assistant_versions
      ADD CONSTRAINT reject_poisoned_name CHECK (name <> 'POISON')
    `);
  });

  afterAll(async () => {
    await pool.query(`
      ALTER TABLE assistant_versions
      DROP CONSTRAINT IF EXISTS reject_poisoned_name
    `);
  });

  it("rolls back the assistant update when the version insert fails", async () => {
    const assistant = await createAssistant("Original", "Original text");

    await expect(
      updateAssistant(assistant.id, { name: "POISON" }),
    ).rejects.toThrow();

    const stored = await pool.query("SELECT * FROM assistants WHERE id = $1", [
      assistant.id,
    ]);

    expect(required(stored.rows[0], "assistant").name).toBe("Original");
  });

  it("leaves no orphaned version rows after a failed update", async () => {
    const assistant = await createAssistant("Original", "Original text");

    await expect(
      updateAssistant(assistant.id, { name: "POISON" }),
    ).rejects.toThrow();

    expect(await versionNumbers(assistant.id)).toEqual([1]);
  });

  it("leaves current_version_id unchanged after a failed update", async () => {
    const assistant = await createAssistant("Original", "Original text");
    const before = await pool.query(
      "SELECT current_version_id FROM assistants WHERE id = $1",
      [assistant.id],
    );

    await expect(
      updateAssistant(assistant.id, { name: "POISON" }),
    ).rejects.toThrow();

    const after = await pool.query(
      "SELECT current_version_id FROM assistants WHERE id = $1",
      [assistant.id],
    );

    expect(required(after.rows[0], "assistant").current_version_id).toBe(
      required(before.rows[0], "assistant").current_version_id,
    );
  });

  it("recovers cleanly and accepts a valid update afterwards", async () => {
    const assistant = await createAssistant("Original", "Original text");

    await expect(
      updateAssistant(assistant.id, { name: "POISON" }),
    ).rejects.toThrow();

    const updated = await updateAssistant(assistant.id, { name: "Valid" });

    expect(required(updated, "updated assistant").name).toBe("Valid");
    expect(await versionNumbers(assistant.id)).toEqual([1, 2]);
  });
});
