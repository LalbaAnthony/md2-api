import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { LivenessResponse, ReadinessResponse, ReadinessState } from "../types/api.ts";
import { isReady } from "../lib/readiness.ts";

const livenessResponseSchema = z.object({
  status: z.literal("ok"),
  uptimeSeconds: z.number(),
});

const readinessResponseSchema = z.object({
  status: z.enum(["ready", "starting"]),
  themesLoaded: z.boolean(),
  formatsWarmedUp: z.boolean(),
});

export const healthRoutes = (readiness: ReadinessState): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = async (app) => {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
      "/healthz",
      {
        schema: {
          summary: "Liveness probe",
          tags: ["operations"],
          response: { 200: livenessResponseSchema },
        },
      },
      async (): Promise<LivenessResponse> => ({
        status: "ok",
        uptimeSeconds: Math.round(process.uptime()),
      }),
    );

    typedApp.get(
      "/readyz",
      {
        schema: {
          summary: "Readiness probe",
          tags: ["operations"],
          response: { 200: readinessResponseSchema, 503: readinessResponseSchema },
        },
      },
      async (_request, reply) => {
        const ready = isReady(readiness);
        const response: ReadinessResponse = {
          status: ready ? "ready" : "starting",
          themesLoaded: readiness.themesLoaded,
          formatsWarmedUp: readiness.formatsWarmedUp,
        };
        return reply.code(ready ? 200 : 503).send(response);
      },
    );
  };
  return plugin;
};
