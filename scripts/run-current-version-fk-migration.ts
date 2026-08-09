import { pool } from "../src/db.js";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  "./src/migrations/add-current-version-foreign-key.sql",
  "utf8",
);
await pool.query(sql);
console.log("Current version foreign key added");
await pool.end();