import { pool } from "./db.js";
import { readFile } from "node:fs/promises";

const sql = await readFile("./src/create-table.sql", "utf8");
await pool.query(sql);
console.log("Schema created");
await pool.end();
