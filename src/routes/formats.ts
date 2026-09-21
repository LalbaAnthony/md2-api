import { z } from "zod";
import { formatNotFoundError } from "../errors.ts";
import { jsonValueSchema } from "../lib/json.ts";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { FormatRegistry } from "../types/format.ts";

const capabilitiesSchema = z.object({
  pagination: z.boolean(),
  pageChrome: z.boolean(),
  titlePage: z.boolean(),
  tableOfContents: z.enum(["resolved", "deferredField", "none"]),
  footnotes: z.enum(["native", "endnotes", "inline", "none"]),
  math: z.enum(["native", "raster", "source"]),
  syntaxHighlighting: z.boolean(),
  columns: z.boolean(),
  landscapeSections: z.boolean(),
  vectorImages: z.boolean(),
  maxListDepth: z.number().int(),
});

const descriptorSchema = z.object({
  id: z.string(),
  label: z.string(),
  mediaType: z.string(),
  fileExtension: z.string(),
  productionReady: z.boolean(),
  capabilities: capabilitiesSchema,
  caveats: z.array(z.string()).readonly(),
});

const formatListSchema = z.object({
  formats: z.array(descriptorSchema),
});

const formatDetailSchema = z.object({
  format: descriptorSchema,
  themeExtensionJsonSchema: jsonValueSchema.nullable(),
});

const formatParametersSchema = z.object({
  id: z.string().min(1).max(64),
});

export const formatRoutes = (registry: FormatRegistry): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = async (app) => {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
      "/formats",
      {
        schema: {
          summary: "List the active output formats",
          tags: ["formats"],
          response: { 200: formatListSchema },
        },
      },
      async () => ({ formats: [...registry.list()] }),
    );

    typedApp.get(
      "/formats/:id",
      {
        schema: {
          summary: "Read an output format descriptor and its theme extension schema",
          tags: ["formats"],
          params: formatParametersSchema,
          response: { 200: formatDetailSchema },
        },
      },
      async (request) => {
        const backend = registry.resolve(request.params.id);
        if (backend === null) {
          throw formatNotFoundError(request.params.id, registry.ids());
        }
        return {
          format: backend.descriptor,
          themeExtensionJsonSchema: backend.themeExtensionJsonSchema,
        };
      },
    );
  };
  return plugin;
};
