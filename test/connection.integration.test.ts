import { pool } from "../src/db.js";
import { describe, it, expect } from "vitest";

describe("database connection", () => {
  it("connects to the test database", async () => {
    const result = await pool.query("SELECT current_database() AS name");

    expect(result.rows[0].name).toBe("ai_workspace_test");
  });
});
