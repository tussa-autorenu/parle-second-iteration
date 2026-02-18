import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { ok } from "../utils/http.js";
import type { Prisma } from "@prisma/client";

const QuerySchema = z.object({
  vehicleId: z.string().optional(),
  triggeredBy: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

type LogsQuery = {
  vehicleId?: string;
  triggeredBy?: string;
  limit?: number;
};

export async function logsRoutes(app: FastifyInstance) {
  app.get("/logs/commands", { schema: { tags: ["logs"] } }, async (req: FastifyRequest<{ Querystring: LogsQuery }>, reply) => {
    const q = QuerySchema.parse(req.query);

    const where: Prisma.CommandLogWhereInput = {};
    if (q.vehicleId) where.vehicleId = q.vehicleId;
    if (q.triggeredBy) where.triggeredBy = q.triggeredBy;

    const logs = await prisma.commandLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.limit
    });

    return ok(reply, { logs });
  });
}
