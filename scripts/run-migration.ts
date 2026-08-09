import { pool } from "../src/db.js";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  "./src/migrations/add-version-number.sql",
  "utf8",
);
await pool.query(sql);
console.log("Migration applied");
await pool.end();