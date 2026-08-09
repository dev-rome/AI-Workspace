import { pool } from "../src/db.js";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  "./src/migrations/add-version-unique-constraint.sql",
  "utf8",
);
await pool.query(sql);
console.log("Unique constraint migration applied");
await pool.end();