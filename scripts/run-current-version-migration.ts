import { pool } from "../src/db.js";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  "./src/migrations/add-current-version.sql",
  "utf8",
);
await pool.query(sql);
console.log("Current version column added");
await pool.end();