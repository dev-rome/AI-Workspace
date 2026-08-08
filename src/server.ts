import Fastify from "fastify";
import {
  getAssistants,
  getAssistantById,
  createAssistant,
  deleteAssistant,
  updateAssistant,
} from "./storage/assistants.js";
import type { AssistantUpdate } from "./types/assistant.js";

const fastify = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      coerceTypes: false,
    },
  },
});

fastify.get("/", () => {
  return { message: "AI Workspace API running" };
});

fastify.get("/health", () => {
  return { status: "ok" };
});

fastify.get("/assistants", () => {
  return getAssistants();
});

fastify.get<{ Params: { id: string } }>("/assistants/:id", (request, reply) => {
  const { id } = request.params;
  const assistant = getAssistantById(id);
  if (!assistant) {
    return reply.code(404).send({
      error: "Assistant not found",
    });
  }
  return assistant;
});

fastify.post<{ Body: { name: string; instructions: string } }>(
  "/assistants",
  {
    schema: {
      body: {
        type: "object",
        properties: {
          name: { type: "string" },
          instructions: { type: "string" },
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

fastify.patch<{
  Params: { id: string };
  Body: AssistantUpdate;
}>(
  "/assistants/:id",
  {
    schema: {
      body: {
        type: "object",
        properties: {
          name: { type: "string" },
          instructions: { type: "string" },
        },
      },
    },
  },
  (request, reply) => {
    const { id } = request.params;
    const updates = request.body;
    const assistant = updateAssistant(id, updates);
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
  (request, reply) => {
    const { id } = request.params;
    const deleted = deleteAssistant(id);
    if (!deleted) {
      return reply.code(404).send({
        error: "Assistant not found",
      });
    }
    return reply.code(204).send();
  },
);

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
