import type { FastifyInstance } from "fastify";
import {
  getAssistants,
  getAssistantById,
  getAssistantVersions,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  restoreAssistantVersion,
  compareAssistantVersions,
} from "../storage/assistants.js";
import { NotFoundError } from "../errors.js";
import type { AssistantUpdate } from "../types/assistant.js";

const uuidSchema = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
};

const assistantBodyProperties = {
  name: { type: "string", minLength: 1, maxLength: 200 },
  instructions: { type: "string", minLength: 1, maxLength: 10000 },
};

export default async function assistantRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: { limit?: number; offset?: number };
  }>(
    "/assistants",
    {
      schema: {
        summary: "List assistants",
        description:
          "Returns assistants newest first. Use `limit` (1-100, default 50) and " +
          "`offset` (default 0) to page through results.",
        tags: ["Assistants"],
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
        response: {
          200: { type: "array", items: { $ref: "assistant#" } },
          400: { $ref: "error#" },
        },
      },
    },
    async (request) => {
      const { limit, offset } = request.query;
      return getAssistants(limit, offset);
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/assistants/:id",
    {
      schema: {
        summary: "Get an assistant",
        description: "Returns a single assistant by id.",
        tags: ["Assistants"],
        params: {
          type: "object",
          properties: { id: uuidSchema },
          required: ["id"],
        },
        response: {
          200: { $ref: "assistant#" },
          400: { $ref: "error#" },
          404: { $ref: "error#" },
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const assistant = await getAssistantById(id);

      if (!assistant) throw new NotFoundError("Assistant not found");

      return assistant;
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/assistants/:id/versions",
    {
      schema: {
        summary: "List version history",
        description:
          "Returns every version of an assistant, newest first. Versions are " +
          "immutable snapshots: an assistant always has at least version 1.",
        tags: ["Versions"],
        params: {
          type: "object",
          properties: { id: uuidSchema },
          required: ["id"],
        },
        response: {
          200: { type: "array", items: { $ref: "assistantVersion#" } },
          400: { $ref: "error#" },
          404: { $ref: "error#" },
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const result = await getAssistantVersions(id);

      if (!result.ok) throw new NotFoundError("Assistant not found");
      return result.versions;
    },
  );

  fastify.get<{
    Params: {
      assistantId: string;
      versionAId: string;
      versionBId: string;
    };
  }>(
    "/assistants/:assistantId/versions/:versionAId/compare/:versionBId",
    {
      schema: {
        summary: "Compare two versions",
        description:
          "Returns both versions plus a `changes` object with an entry per " +
          "field: `changed` indicates whether the value differs, and `from` " +
          "and `to` hold the two values. Both versions must belong to the " +
          "named assistant.",
        tags: ["Versions"],
        params: {
          type: "object",
          properties: {
            assistantId: uuidSchema,
            versionAId: uuidSchema,
            versionBId: uuidSchema,
          },
          required: ["assistantId", "versionAId", "versionBId"],
        },
        response: {
          200: { $ref: "comparison#" },
          400: { $ref: "error#" },
          404: { $ref: "error#" },
        },
      },
    },
    async (request) => {
      const { assistantId, versionAId, versionBId } = request.params;
      const comparison = await compareAssistantVersions(
        assistantId,
        versionAId,
        versionBId,
      );

      if (!comparison) {
        throw new NotFoundError(
          "One or both versions were not found for this assistant",
        );
      }

      return comparison;
    },
  );

  fastify.post<{
    Body: { name: string; instructions: string };
  }>(
    "/assistants",
    {
      schema: {
        summary: "Create an assistant",
        description:
          "Creates an assistant and its first version. The new assistant's " +
          "`current_version_id` points at version 1.",
        tags: ["Assistants"],
        body: {
          type: "object",
          additionalProperties: false,
          properties: assistantBodyProperties,
          required: ["name", "instructions"],
        },
        response: {
          201: { $ref: "assistant#" },
          400: { $ref: "error#" },
          409: { $ref: "error#" },
        },
      },
    },
    async (request, reply) => {
      const { name, instructions } = request.body;
      reply.code(201);
      return createAssistant(name, instructions);
    },
  );

  fastify.post<{ Params: { id: string; versionId: string } }>(
    "/assistants/:id/versions/:versionId/restore",
    {
      schema: {
        summary: "Restore a previous version",
        description:
          "Creates a new version containing the restored version's content and " +
          "points the assistant at it. History is never rewritten: restoring " +
          "version 1 while on version 2 produces version 3. Returns 404 if " +
          "either the assistant or the version does not exist, with a message " +
          "identifying which.",
        tags: ["Versions"],
        params: {
          type: "object",
          properties: { id: uuidSchema, versionId: uuidSchema },
          required: ["id", "versionId"],
        },
        response: {
          200: { $ref: "assistant#" },
          400: { $ref: "error#" },
          404: { $ref: "error#" },
        },
      },
    },
    async (request) => {
      const { id, versionId } = request.params;
      const result = await restoreAssistantVersion(id, versionId);

      if (!result.ok) {
        throw new NotFoundError(
          result.reason === "assistant_not_found"
            ? "Assistant not found"
            : "Version not found for this assistant",
        );
      }
      return result.assistant;
    },
  );

  fastify.patch<{
    Params: { id: string };
    Body: AssistantUpdate;
  }>(
    "/assistants/:id",
    {
      schema: {
        summary: "Update an assistant",
        description:
          "Partial update: omitted fields keep their current values. Every " +
          "update creates a new version snapshot rather than overwriting, and " +
          "points `current_version_id` at it. At least one field is required.",
        tags: ["Assistants"],
        params: {
          type: "object",
          properties: { id: uuidSchema },
          required: ["id"],
        },
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: assistantBodyProperties,
        },
        response: {
          200: { $ref: "assistant#" },
          400: { $ref: "error#" },
          404: { $ref: "error#" },
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const assistant = await updateAssistant(id, request.body);

      if (!assistant) throw new NotFoundError("Assistant not found");

      return assistant;
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/assistants/:id",
    {
      schema: {
        summary: "Delete an assistant",
        description:
          "Permanently deletes the assistant and its entire version history. " +
          "This cannot be undone. Returns 204 with no body.",
        tags: ["Assistants"],
        params: {
          type: "object",
          properties: { id: uuidSchema },
          required: ["id"],
        },
        response: {
          204: { type: "null" },
          400: { $ref: "error#" },
          404: { $ref: "error#" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const deleted = await deleteAssistant(id);

      if (!deleted) throw new NotFoundError("Assistant not found");

      return reply.code(204).send();
    },
  );
}
