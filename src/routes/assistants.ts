import type { FastifyInstance } from "fastify";

import {
  getAssistants,
  getAssistantById,
  getAssistantVersions,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  restoreAssistantVersion,
} from "../storage/assistants.js";

import type { AssistantUpdate } from "../types/assistant.js";

export default async function assistantRoutes(fastify: FastifyInstance) {
  fastify.get("/assistants", () => {
    return getAssistants();
  });

  fastify.get<{ Params: { id: string } }>(
    "/assistants/:id",
    async (request, reply) => {
      const { id } = request.params;
      const assistant = await getAssistantById(id);
      if (!assistant) {
        return reply.code(404).send({
          error: "Assistant not found",
        });
      }
      return assistant;
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/assistants/:id/versions",
    async (request, reply) => {
      const { id } = request.params;
      const versions = await getAssistantVersions(id);
      return versions;
    },
  );

  fastify.post<{ Body: { name: string; instructions: string } }>(
    "/assistants",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1 },
            instructions: { type: "string", minLength: 1 },
          },
          required: ["name", "instructions"],
        },
      },
    },
    (request, reply) => {
      const { name, instructions } = request.body;
      reply.code(201);
      return createAssistant(name, instructions);
    },
  );

  fastify.post<{
    Params: {
      id: string;
      versionId: string;
    };
  }>("/assistants/:id/versions/:versionId/restore", async (request, reply) => {
    const { id, versionId } = request.params;
    const assistant = await restoreAssistantVersion(id, versionId);
    if (!assistant) {
      return reply.code(404).send({
        error: "Assistant or version not found",
      });
    }
    return assistant;
  });

  fastify.patch<{
    Params: { id: string };
    Body: AssistantUpdate;
  }>(
    "/assistants/:id",
    {
      schema: {
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1 },
            instructions: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const updates = request.body;
      const assistant = await updateAssistant(id, updates);
      if (!assistant) {
        return reply.code(404).send({
          error: "Assistant not found",
        });
      }
      return reply.code(200).send(assistant);
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/assistants/:id",
    async (request, reply) => {
      const { id } = request.params;
      const deleted = await deleteAssistant(id);
      if (!deleted) {
        return reply.code(404).send({
          error: "Assistant not found",
        });
      }
      return reply.code(204).send();
    },
  );
}
