import Fastify from "fastify";
import { request } from "node:http";

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
  async (request, reply) => {
    const { name, instructions } = request.body;

    return reply.code(201).send({
      name,
      instructions,
    });
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
