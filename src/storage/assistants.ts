import { pool } from "../db.js";
import { type PoolClient } from "pg";
import {
  type Assistant,
  type AssistantVersion,
  type AssistantUpdate,
} from "../types/assistant.js";
import { firstRow, maybeRow } from "../query-helpers.js";

async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function applyNewVersion(
  client: PoolClient,
  assistantId: string,
  name: string,
  instructions: string,
): Promise<Assistant> {
  const versionResult = await client.query<{ next_version: number }>(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
       FROM assistant_versions
      WHERE assistant_id = $1`,
    [assistantId],
  );
  const { next_version: nextVersion } = firstRow(versionResult.rows);

  const insertResult = await client.query<AssistantVersion>(
    `INSERT INTO assistant_versions
        (assistant_id, version_number, name, instructions)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
    [assistantId, nextVersion, name, instructions],
  );

  const newVersion = firstRow(insertResult.rows);
  const assistantResult = await client.query<Assistant>(
    `UPDATE assistants
        SET name = $1, instructions = $2, current_version_id = $3
      WHERE id = $4
      RETURNING *`,
    [name, instructions, newVersion.id, assistantId],
  );

  return firstRow(assistantResult.rows);
}

export async function getAssistants(limit = 50, offset = 0) {
  const result = await pool.query<Assistant>(
    `SELECT *
       FROM assistants
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return result.rows;
}

export async function getAssistantById(id: string) {
  const result = await pool.query<Assistant>(
    "SELECT * FROM assistants WHERE id = $1",
    [id],
  );

  return maybeRow(result.rows);
}

export async function getAssistantVersions(assistantId: string) {
  const result = await pool.query<AssistantVersion>(
    `SELECT *
       FROM assistant_versions
      WHERE assistant_id = $1
      ORDER BY version_number DESC`,
    [assistantId],
  );

  return result.rows;
}

export async function createAssistant(name: string, instructions: string) {
  return withTransaction(async (client) => {
    const result = await client.query<Assistant>(
      "INSERT INTO assistants(name, instructions) VALUES ($1, $2) RETURNING *",
      [name, instructions],
    );
    const assistant = firstRow(result.rows);

    return applyNewVersion(client, assistant.id, name, instructions);
  });
}

export async function updateAssistant(id: string, updates: AssistantUpdate) {
  return withTransaction(async (client) => {
    const result = await client.query<Assistant>(
      "SELECT * FROM assistants WHERE id = $1 FOR UPDATE",
      [id],
    );
    const assistant = maybeRow(result.rows);

    if (!assistant) return null;

    const name = updates.name ?? assistant.name;
    const instructions = updates.instructions ?? assistant.instructions;

    return applyNewVersion(client, id, name, instructions);
  });
}

export async function deleteAssistant(id: string) {
  const result = await pool.query(
    "DELETE FROM assistants WHERE id = $1 RETURNING id",
    [id],
  );

  return result.rows.length > 0;
}

export async function restoreAssistantVersion(
  assistantId: string,
  versionId: string,
) {
  return withTransaction(async (client) => {
    const assistantResult = await client.query<Assistant>(
      "SELECT * FROM assistants WHERE id = $1 FOR UPDATE",
      [assistantId],
    );

    if (!maybeRow(assistantResult.rows)) return null;

    const versionResult = await client.query<AssistantVersion>(
      `SELECT *
         FROM assistant_versions
        WHERE id = $1
          AND assistant_id = $2`,
      [versionId, assistantId],
    );

    const version = maybeRow(versionResult.rows);

    if (!version) return null;

    return applyNewVersion(
      client,
      assistantId,
      version.name,
      version.instructions,
    );
  });
}

export async function compareAssistantVersions(
  assistantId: string,
  versionAId: string,
  versionBId: string,
) {
  const result = await pool.query<AssistantVersion>(
    `SELECT *
       FROM assistant_versions
      WHERE id IN ($1, $2)
        AND assistant_id = $3`,
    [versionAId, versionBId, assistantId],
  );

  const versions = result.rows;
  const versionA = versions.find((version) => version.id === versionAId);
  const versionB = versions.find((version) => version.id === versionBId);

  if (!versionA || !versionB) return null;

  const changes = {
    name: {
      changed: versionA.name !== versionB.name,
      from: versionA.name,
      to: versionB.name,
    },
    instructions: {
      changed: versionA.instructions !== versionB.instructions,
      from: versionA.instructions,
      to: versionB.instructions,
    },
  };

  return { versionA, versionB, changes };
}
