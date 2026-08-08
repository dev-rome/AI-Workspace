import Fastify from "fastify";
import assistantRoutes from "./routes/assistants.js";

const fastify = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      removeAdditional: false,
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

fastify.register(assistantRoutes);

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
