import { pool } from "../db.js";
import { describe, it, expect } from "vitest";
import { createAssistant } from "./assistants.js";

describe("createAssistant", () => {
  it("inserts an assistant row", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");

    expect(assistant.name).toBe("Test Bot");

    const result = await pool.query("SELECT * FROM assistants");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Test Bot");
    expect(result.rows[0].instructions).toBe("Be helpful");
  });

  it("creates a first version", async () => {
    const assistant = await createAssistant("Test Bot", "Be helpful");

    const result = await pool.query(
      "SELECT * FROM assistant_versions WHERE assistant_id = $1",
      [assistant.id],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].version_number).toBe(1);
    expect(result.rows[0].name).toBe("Test Bot");
    expect(result.rows[0].instructions).toBe("Be helpful");
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

    expect(stored.rows[0].current_version_id).not.toBeNull();
    expect(versions.rows[0].id).toBe(stored.rows[0].current_version_id);
  });
});
