import { previewPage } from "../openapi/examples.ts";
import type { FastifyPluginAsync } from "fastify";
import type { FormatRegistry } from "../types/format.ts";
import type { ThemeRegistry } from "../types/theme-registry.ts";

export const PREVIEW_ROUTE = "/preview";

export const previewRoutes = (
  themes: ThemeRegistry,
  formats: FormatRegistry,
): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = async (app) => {
    app.get(PREVIEW_ROUTE, { schema: { hide: true } }, (_request, reply) =>
      reply
        .code(200)
        .header("Content-Type", "text/html; charset=utf-8")
        .send(
          previewPage(
            themes.list().map((summary) => ({ id: summary.id, label: summary.label })),
            formats.list().map((descriptor) => ({
              id: descriptor.id,
              label: descriptor.label,
            })),
          ),
        ),
    );
    await Promise.resolve();
  };
  return plugin;
};
