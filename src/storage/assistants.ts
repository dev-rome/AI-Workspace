import { pool } from "../db.js";
import { randomUUID } from "node:crypto";
import { type Assistant, type AssistantUpdate } from "../types/assistant.js";

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

export async function createAssistant(name: string, instructions: string) {
  const result = await pool.query(
    "INSERT INTO assistants(name, instructions) VALUES ($1, $2) RETURNING *",
    [name, instructions],
  );
  return result.rows[0];
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
    const name = updates.name ?? assistant.name;
    const instructions = updates.instructions ?? assistant.instructions;
    const updateResult = await client.query(
      `UPDATE assistants
       SET name = $1, instructions = $2
       WHERE id = $3
       RETURNING *`,
      [name, instructions, id],
    );
    await client.query("COMMIT");
    return updateResult.rows[0] ?? null;
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
