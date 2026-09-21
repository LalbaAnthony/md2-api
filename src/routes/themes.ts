import { z } from "zod";
import { themeNotFoundError } from "../errors.ts";
import { themeSchema } from "../theme/schema.ts";
import { computeContentHeight, computeContentWidth } from "../theme/tokens.ts";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { ThemeCaveatProvider } from "../types/api.ts";
import type { ThemeRegistry } from "../types/theme-registry.ts";

const themeSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  version: z.string(),
  origin: z.enum(["builtin", "directory"]),
  hash: z.string(),
});

const themeListSchema = z.object({
  themes: z.array(themeSummarySchema),
});

const themeDetailSchema = z.object({
  theme: themeSchema,
  metrics: z.object({
    contentWidth: z.number(),
    contentHeight: z.number(),
  }),
  caveats: z.record(z.string(), z.array(z.string()).readonly()).readonly(),
});

const themeParametersSchema = z.object({
  id: z.string().min(1).max(64),
});

export const themeRoutes = (
  registry: ThemeRegistry,
  caveatProvider: ThemeCaveatProvider,
): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = async (app) => {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
      "/themes",
      {
        schema: {
          summary: "List the available themes",
          tags: ["themes"],
          response: { 200: themeListSchema },
        },
      },
      async () => ({ themes: [...registry.list()] }),
    );

    typedApp.get(
      "/themes/:id",
      {
        schema: {
          summary: "Read a theme and the caveats of each active output format",
          tags: ["themes"],
          params: themeParametersSchema,
          response: { 200: themeDetailSchema },
        },
      },
      async (request) => {
        const theme = registry.get(request.params.id);
        if (theme === null) {
          throw themeNotFoundError(request.params.id, registry.ids());
        }
        return {
          theme,
          metrics: {
            contentWidth: computeContentWidth(theme),
            contentHeight: computeContentHeight(theme),
          },
          caveats: caveatProvider(theme),
        };
      },
    );
  };
  return plugin;
};
