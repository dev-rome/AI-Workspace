import { afterAll, beforeEach } from "vitest";
import { pool } from "../src/db.js";

// Setup for integration tests only. These talk to the real test database,
// so every test needs to start from a known empty state and the pool has to
// be closed at the end or the process will hang.

// Guard: refuse to run against anything that is not clearly a test database.
// TRUNCATE is irreversible, and a mistyped DATABASE_URL would otherwise wipe
// development data.
const url = process.env.DATABASE_URL ?? "";
const databaseName = url.split("/").pop()?.split("?")[0] ?? "";

if (!databaseName.endsWith("_test")) {
  throw new Error(
    `Integration tests refuse to run against "${databaseName}". ` +
      `The database name must end in _test.`,
  );
}

beforeEach(async () => {
  await pool.query("TRUNCATE assistants, assistant_versions CASCADE");
});

afterAll(async () => {
  await pool.end();
});
