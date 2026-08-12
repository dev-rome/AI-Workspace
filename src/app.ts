import Fastify from "fastify";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import assistantRoutes from "./routes/assistants.js";
import { HttpError } from "./errors.js";

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ECONNRESET",
  "57P01",
  "57P03",
]);

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

  app.addHook("preValidation", async (request) => {
    const body = request.body;
    if (body === null || typeof body !== "object" || Array.isArray(body))
      return;

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") {
        (body as Record<string, unknown>)[key] = value.trim();
      }
    }
  });

  app.register(assistantRoutes);

  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      // 1. Validation failures
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

      // 2. Unique constraint violation -> 409, not 500. The request was well
      //    formed; it collided with existing data.
      if (error.code === "23505") {
        return reply.code(409).send({
          error: "Conflict",
          message: "That version already exists",
        });
      }

      // 3. Database unreachable -> 503, not 500. Nothing is wrong with the
      //    request or the code, so tell the client to retry.
      if (
        typeof error.code === "string" &&
        CONNECTION_ERROR_CODES.has(error.code)
      ) {
        request.log.error(error);
        return reply.code(503).send({
          error: "Service Unavailable",
          message: "The service is temporarily unavailable. Please try again.",
        });
      }

      const statusCode = error.statusCode ?? 500;

      // 4. Everything else at 500+: log the real error, hide the details.
      if (statusCode >= 500) {
        request.log.error(error);
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Something went wrong",
        });
      }

      // 5. Intentional client errors: thrown HttpErrors, plus framework 4xx.
      return reply.code(statusCode).send({
        error: error instanceof HttpError ? error.error : error.name,
        message: error.message,
      });
    },
  );

  return app;
}
