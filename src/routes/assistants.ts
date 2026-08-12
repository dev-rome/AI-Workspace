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
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
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
        params: {
          type: "object",
          properties: { id: uuidSchema },
          required: ["id"],
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
        params: {
          type: "object",
          properties: { id: uuidSchema },
          required: ["id"],
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const assistant = await getAssistantById(id);

      if (!assistant) throw new NotFoundError("Assistant not found");

      return getAssistantVersions(id);
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
        params: {
          type: "object",
          properties: {
            assistantId: uuidSchema,
            versionAId: uuidSchema,
            versionBId: uuidSchema,
          },
          required: ["assistantId", "versionAId", "versionBId"],
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
        body: {
          type: "object",
          additionalProperties: false,
          properties: assistantBodyProperties,
          required: ["name", "instructions"],
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
        params: {
          type: "object",
          properties: { id: uuidSchema, versionId: uuidSchema },
          required: ["id", "versionId"],
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
        params: {
          type: "object",
          properties: { id: uuidSchema },
          required: ["id"],
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
