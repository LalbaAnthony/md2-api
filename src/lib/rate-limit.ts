import rateLimit from "@fastify/rate-limit";
import { rateLimitedError } from "../errors.ts";
import type { FastifyInstance } from "fastify";
import type { RateLimitPolicy } from "../types/rate-limit.ts";

const MILLISECONDS_PER_SECOND = 1_000;

export const retryAfterSecondsOf = (ttlMs: number): number =>
  Math.max(1, Math.ceil(ttlMs / MILLISECONDS_PER_SECOND));

export const registerRateLimit = async (
  scope: FastifyInstance,
  policy: RateLimitPolicy,
): Promise<void> => {
  await scope.register(rateLimit, {
    max: policy.max,
    timeWindow: policy.windowMs,
    hook: "onRequest",
    enableDraftSpec: true,
    errorResponseBuilder: (_request, context) => rateLimitedError(retryAfterSecondsOf(context.ttl)),
  });
};
