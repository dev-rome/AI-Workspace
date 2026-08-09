import { pool } from "../db.js";
import { type AssistantUpdate } from "../types/assistant.js";

export async function getAssistants() {
  const result = await pool.query(
    "SELECT * FROM assistants ORDER BY created_at DESC",
  );
  return result.rows;
}

export async function getAssistantById(id: string) {
  const result = await pool.query("SELECT * FROM assistants WHERE id = $1", [
    id,
  ]);
  return result.rows[0] ?? null;
}

export async function getAssistantVersions(assistantId: string) {
  const result = await pool.query(
    `SELECT *
     FROM assistant_versions
     WHERE assistant_id = $1
     ORDER BY version_number DESC`,
    [assistantId],
  );
  return result.rows;
}

export async function createAssistant(name: string, instructions: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "INSERT INTO assistants(name, instructions) VALUES ($1, $2) RETURNING *",
      [name, instructions],
    );
    const assistant = result.rows[0];
    await client.query(
      `INSERT INTO assistant_versions
       (assistant_id, version_number, name, instructions)
       VALUES ($1, $2, $3, $4)`,
      [assistant.id, 1, assistant.name, assistant.instructions],
    );
    await client.query("COMMIT");
    return assistant;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAssistant(id: string, updates: AssistantUpdate) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT * FROM assistants WHERE id = $1",
      [id],
    );
    const assistant = result.rows[0];
    if (!assistant) {
      await client.query("ROLLBACK");
      return null;
    }
    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
   FROM assistant_versions
   WHERE assistant_id = $1`,
      [id],
    );
    const nextVersion = versionResult.rows[0].next_version;
    const name = updates.name ?? assistant.name;
    const instructions = updates.instructions ?? assistant.instructions;
    await client.query(
      `UPDATE assistants
   SET name = $1, instructions = $2
   WHERE id = $3`,
      [name, instructions, id],
    );
    const versionInsertResult = await client.query(
      `INSERT INTO assistant_versions
   (assistant_id, version_number, name, instructions)
   VALUES ($1, $2, $3, $4)
   RETURNING *`,
      [id, nextVersion, name, instructions],
    );
    const newVersion = versionInsertResult.rows[0];
    const currentVersionResult = await client.query(
      `UPDATE assistants
   SET current_version_id = $1
   WHERE id = $2
   RETURNING *`,
      [newVersion.id, id],
    );
    await client.query("COMMIT");
    return currentVersionResult.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAssistant(id: string) {
  const result = await pool.query(
    "DELETE FROM assistants WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows.length > 0;
}

export async function restoreAssistantVersion(
  assistantId: string,
  versionId: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT *
       FROM assistant_versions
       WHERE id = $1
         AND assistant_id = $2`,
      [versionId, assistantId],
    );
    const version = result.rows[0];
    if (!version) {
      await client.query("ROLLBACK");
      return null;
    }
    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
       FROM assistant_versions
       WHERE assistant_id = $1`,
      [assistantId],
    );
    const nextVersion = versionResult.rows[0].next_version;
    await client.query(
      `UPDATE assistants
   SET name = $1, instructions = $2
   WHERE id = $3`,
      [version.name, version.instructions, assistantId],
    );
    const versionInsertResult = await client.query(
      `INSERT INTO assistant_versions
   (assistant_id, version_number, name, instructions)
   VALUES ($1, $2, $3, $4)
   RETURNING *`,
      [assistantId, nextVersion, version.name, version.instructions],
    );
    const newVersion = versionInsertResult.rows[0];
    const currentVersionResult = await client.query(
      `UPDATE assistants
   SET current_version_id = $1
   WHERE id = $2
   RETURNING *`,
      [newVersion.id, assistantId],
    );
    await client.query("COMMIT");
    return currentVersionResult.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
