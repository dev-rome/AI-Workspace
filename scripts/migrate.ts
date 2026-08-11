import { pool } from "../src/db.js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Migration runner.
//
// Applies every .sql file in src/migrations in filename order, exactly once,
// recording each in a schema_migrations table. Safe to run repeatedly: already
// applied files are skipped. Targets whatever DATABASE_URL points at, so the
// same command builds the dev database and the test database.
//
// Each migration runs in its own transaction. Postgres supports transactional
// DDL, so a failed migration rolls back completely rather than leaving the
// schema half-changed. Earlier migrations that already succeeded stay applied
// and recorded, so after fixing the broken file you re-run and it resumes from
// the failure point instead of redoing everything.

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../src/migrations");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedFilenames(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  return new Set(result.rows.map((row) => row.filename));
}

async function getMigrationFilenames(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return (
    entries
      .filter((name) => name.endsWith(".sql"))
      .sort()
  );
}

async function applyMigration(filename: string) {
  const sql = await readFile(path.join(MIGRATIONS_DIR, filename), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
      filename,
    ]);
    await client.query("COMMIT");
    console.log(`applied  ${filename}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`FAILED   ${filename}`);
    throw error;
  } finally {
    client.release();
  }
}

async function migrate() {
  await ensureMigrationsTable();

  const [applied, all] = await Promise.all([
    getAppliedFilenames(),
    getMigrationFilenames(),
  ]);

  const pending = all.filter((filename) => !applied.has(filename));

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  console.log(`${pending.length} pending migration(s).`);
  for (const filename of pending) {
    await applyMigration(filename);
  }
  console.log("Done.");
}

try {
  await migrate();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
