import type { FastifyReply } from "fastify";
import { ApiError } from "./errors.js";

export function ok(reply: FastifyReply, data: unknown, statusCode = 200) {
  return reply.code(statusCode).send({ ok: true, data });
}

export function fail(reply: FastifyReply, err: unknown) {
  if (err instanceof ApiError) {
    return reply.code(err.statusCode).send({
      ok: false,
      error: { reason: err.reason, message: err.message, details: err.details ?? null }
    });
  }
  return reply.code(500).send({
    ok: false,
    error: { reason: "unknown", message: "Internal error", details: null }
  });
}
