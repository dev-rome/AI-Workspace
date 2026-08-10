export function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected a row but the query returned none");
  }
  return row;
}

export function maybeRow<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}
