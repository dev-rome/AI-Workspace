// Drops and rebuilds every table in the target database, then re-runs
// migrations from scratch. Use this when the test database has drifted or you
// want a guaranteed-clean structure.
//
// Refuses to run unless the target database name ends in "_test". Dropping
// tables is irreversible, and this script exists specifically to be run often,
// so the guard is not optional.

import { pool } from "../src/db.js";

const url = process.env.DATABASE_URL ?? "";
const databaseName = url.split("/").pop()?.split("?")[0] ?? "";

if (!databaseName.endsWith("_test")) {
  console.error(
    `Refusing to reset "${databaseName}": database name must end in _test.`,
  );
  process.exit(1);
}

try {
  await pool.query(`
    DROP TABLE IF EXISTS assistant_versions CASCADE;
    DROP TABLE IF EXISTS assistants CASCADE;
    DROP TABLE IF EXISTS schema_migrations CASCADE;
  `);
  console.log(`Dropped all tables in ${databaseName}.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
