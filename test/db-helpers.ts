import { pool } from "../src/db.js";
import { getAssistantVersions } from "../src/storage/assistants.js";

export const MISSING_ID = "00000000-0000-0000-0000-000000000000";

// Narrows a value the test knows must exist. In production code a thrown
// error is a failure to avoid; in a test it IS the failure signal, and the
// message points at the setup that did not produce what the test assumed.
export function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${label} to exist`);
  }
  return value;
}

export function versionsOrdered(assistantId: string) {
  return pool.query(
    `SELECT * FROM assistant_versions
     WHERE assistant_id = $1
     ORDER BY version_number`,
    [assistantId],
  );
}

export async function versionNumbers(assistantId: string) {
  const result = await versionsOrdered(assistantId);
  return result.rows.map((row) => row.version_number);
}

export async function firstVersionOf(assistantId: string) {
  const result = await getAssistantVersions(assistantId);
  if (!result.ok) throw new Error("Expected the assistant to exist");
  return required(
    result.versions.find((version) => version.version_number === 1),
    "version 1",
  );
}
