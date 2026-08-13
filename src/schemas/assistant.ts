// Shared response schemas, registered once on the app and referenced by $id
// from each route. Two reasons this matters beyond documentation:
//
//   1. Fastify STRIPS any field not declared here before sending. That is a
//      safety property, not just tidiness: once users exist, a password hash
//      cannot leak through a SELECT * even if the handler forgets to omit it.
//   2. Fastify compiles these into purpose-built serializers, which is faster
//      than generic JSON.stringify.

export const assistantSchema = {
  $id: "assistant",
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    instructions: { type: "string" },
    // Nullable in the database until the first version is created, so the
    // schema has to allow null or Fastify would strip it to undefined.
    current_version_id: { type: ["string", "null"], format: "uuid" },
    // A Date in TypeScript, an ISO 8601 string once serialized.
    created_at: { type: "string", format: "date-time" },
  },
} as const;

export const assistantVersionSchema = {
  $id: "assistantVersion",
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    assistant_id: { type: "string", format: "uuid" },
    version_number: { type: "integer" },
    name: { type: "string" },
    instructions: { type: "string" },
    created_at: { type: "string", format: "date-time" },
  },
} as const;

// One field-level diff: did it change, and what were the two values.
const changeSchema = {
  type: "object",
  properties: {
    changed: { type: "boolean" },
    from: { type: "string" },
    to: { type: "string" },
  },
} as const;

export const comparisonSchema = {
  $id: "comparison",
  type: "object",
  properties: {
    versionA: { $ref: "assistantVersion#" },
    versionB: { $ref: "assistantVersion#" },
    changes: {
      type: "object",
      properties: {
        name: changeSchema,
        instructions: changeSchema,
      },
    },
  },
} as const;

// Every error response in the app uses this envelope, so it is declared once.
export const errorSchema = {
  $id: "error",
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;
