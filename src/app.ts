import Fastify from "fastify";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import assistantRoutes from "./routes/assistants.js";
import { HttpError } from "./errors.js";

export function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: true,
      },
    },
  });

  app.get("/", () => ({ message: "AI Workspace API running" }));
  app.get("/health", () => ({ status: "ok" }));
  app.register(assistantRoutes);
  app.setErrorHandler(

    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      if (error.validation) {
        const validation = error.validation[0];

        if (validation?.keyword === "pattern") {
          return reply.code(400).send({
            error: "Invalid request",
            message: `${validation.instancePath.replace(/^\//, "")} must be a valid UUID`,
          });
        }
        if (validation?.keyword === "minProperties") {
          return reply.code(400).send({
            error: "Invalid request",
            message: "Request body must contain at least one field",
          });
        }
        if (validation?.keyword === "additionalProperties") {
          return reply.code(400).send({
            error: "Invalid request",
            message: "Request body contains an unsupported field",
          });
        }
        return reply.code(400).send({
          error: "Invalid request",
          message: error.message,
        });
      }
      const statusCode = error.statusCode ?? 500;
      if (statusCode >= 500) {
        request.log.error(error);
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Something went wrong",
        });
      }
      return reply.code(statusCode).send({
        error: error instanceof HttpError ? error.error : error.name,
        message: error.message,
      });
    },
  );
  return app;
}
