import { z } from "zod";
import { DEFAULT_DOCUMENT_LANGUAGE } from "../constants.ts";
import { themeNotFoundError } from "../errors.ts";
import { contentDispositionOf, sanitiseFileName } from "../lib/filename.ts";
import { selectFormat } from "../formats/negotiate.ts";
import { convertMarkdown } from "../pipeline/convert.ts";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { ConvertOutcome } from "../types/conversion.ts";
import type { ConvertMetadataInput, ConvertRouteDependencies } from "../types/api.ts";
import type { MetadataOverrides } from "../types/pipeline.ts";

const identifierPattern = /^[a-z0-9][a-z0-9-]{1,31}$/;

export const convertBodySchema = z.strictObject({
  markdown: z.string().min(1),
  theme: z.string().regex(identifierPattern).optional(),
  format: z.string().regex(identifierPattern).optional(),
  filename: z
    .string()
    .max(200)
    .regex(/^[\w\-. ]+$/)
    .optional(),
  metadata: z
    .strictObject({
      title: z.string().max(500).optional(),
      subtitle: z.string().max(500).optional(),
      author: z.array(z.string().max(200)).max(20).optional(),
      date: z.string().max(100).optional(),
      subject: z.string().max(500).optional(),
      keywords: z.array(z.string().max(100)).max(50).optional(),
      language: z.string().max(35).optional(),
    })
    .optional(),
  options: z
    .strictObject({
      tableOfContents: z.boolean().optional(),
      titlePage: z.boolean().optional(),
      strict: z.boolean().optional(),
    })
    .optional(),
});

const convertQuerySchema = z.object({
  format: z.string().regex(identifierPattern).optional(),
  filename: z
    .string()
    .max(200)
    .regex(/^[\w\-. ]+$/)
    .optional(),
});

const convertParametersSchema = z.object({
  themeId: z.string().min(1).max(64),
});

const metadataOverridesOf = (body: ConvertMetadataInput | undefined): MetadataOverrides => {
  if (body === undefined) {
    return {};
  }
  return {
    ...(body.title === undefined ? {} : { title: body.title }),
    ...(body.subtitle === undefined ? {} : { subtitle: body.subtitle }),
    ...(body.author === undefined ? {} : { authors: body.author }),
    ...(body.date === undefined ? {} : { date: body.date }),
    ...(body.subject === undefined ? {} : { subject: body.subject }),
    ...(body.keywords === undefined ? {} : { keywords: body.keywords }),
    ...(body.language === undefined ? {} : { language: body.language }),
  };
};

export const convertRoutes = (dependencies: ConvertRouteDependencies): FastifyPluginAsync => {
  const { config, themes, formats, semaphore } = dependencies;

  const runConversion = async (
    markdown: string,
    themeId: string,
    requestedFormat: string | undefined,
    acceptHeader: string | undefined,
    metadata: MetadataOverrides,
    documentOptions: { tableOfContents?: boolean; titlePage?: boolean },
    strict: boolean,
  ): Promise<ConvertOutcome & { readonly themeId: string; readonly formatId: string }> => {
    const theme = themes.get(themeId);
    if (theme === null) {
      throw themeNotFoundError(themeId, themes.ids());
    }

    const selection = selectFormat(formats, {
      bodyFormat: requestedFormat,
      acceptHeader,
      defaultFormat: config.DEFAULT_FORMAT,
    });

    const release = await semaphore.acquire();
    try {
      const outcome = await convertMarkdown({
        markdown,
        theme,
        backend: selection.backend,
        strict,
        maxMarkdownBytes: config.MAX_MARKDOWN_BYTES,
        maxNestingDepth: config.MAX_NESTING_DEPTH,
        timeoutMs: config.CONVERT_TIMEOUT_MS,
        imagePolicy: {
          allowRemote: config.ALLOW_REMOTE_IMAGES,
          allowLocal: config.ALLOW_LOCAL_IMAGES,
          allowlist: config.IMAGE_ALLOWLIST,
          assetsDirectory: config.ASSETS_DIR,
          maximumBytes: config.MAX_IMAGE_BYTES,
          maximumPixels: config.MAX_IMAGE_PIXELS,
          maximumImagesPerDocument: config.MAX_IMAGES_PER_DOCUMENT,
          timeoutMs: config.IMAGE_FETCH_TIMEOUT_MS,
        },
        defaultLanguage: DEFAULT_DOCUMENT_LANGUAGE,
        metadata,
        documentOptions,
      });
      return { ...outcome, themeId, formatId: selection.backend.descriptor.id };
    } finally {
      release();
    }
  };

  const sendResult = (
    reply: FastifyReply,
    outcome: ConvertOutcome & { readonly themeId: string; readonly formatId: string },
    requestedFileName: string | undefined,
  ): FastifyReply => {
    const fileName = sanitiseFileName(requestedFileName, outcome.result.fileExtension);
    reply.log.info(
      {
        themeId: outcome.themeId,
        formatId: outcome.formatId,
        markdownBytes: outcome.markdownBytes,
        blockCount: outcome.blockCount,
        imageCount: outcome.imageCount,
        parseMs: Math.round(outcome.timings.parseMs),
        normalizeMs: Math.round(outcome.timings.normalizeMs),
        compileMs: Math.round(outcome.timings.compileMs),
        renderMs: Math.round(outcome.timings.renderMs),
        packMs: Math.round(outcome.timings.packMs),
        totalMs: Math.round(outcome.timings.totalMs),
        outputBytes: outcome.result.body.byteLength,
        warningCount: outcome.warnings.length,
      },
      "Conversion completed.",
    );
    for (const conversionWarning of outcome.warnings) {
      reply.log.warn(
        { code: conversionWarning.code, detail: conversionWarning.detail },
        conversionWarning.message,
      );
    }
    return reply
      .code(200)
      .header("Content-Type", outcome.result.mediaType)
      .header("Content-Disposition", contentDispositionOf(fileName))
      .header("Content-Length", String(outcome.result.body.byteLength))
      .header("X-Convert-Ms", String(Math.round(outcome.timings.totalMs)))
      .header("X-Output-Format", outcome.formatId)
      .header("X-Conversion-Warnings", String(outcome.warnings.length))
      .send(Buffer.from(outcome.result.body));
  };

  const plugin: FastifyPluginAsync = async (app) => {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post(
      "/convert",
      {
        schema: {
          summary: "Convert a markdown document",
          tags: ["conversion"],
          body: convertBodySchema,
          response: {
            200: z.string().describe("The converted document"),
          },
        },
      },
      async (request, reply) => {
        const body = request.body;
        const outcome = await runConversion(
          body.markdown,
          body.theme ?? config.DEFAULT_THEME,
          body.format,
          request.headers.accept,
          metadataOverridesOf(body.metadata),
          {
            ...(body.options?.tableOfContents === undefined
              ? {}
              : { tableOfContents: body.options.tableOfContents }),
            ...(body.options?.titlePage === undefined ? {} : { titlePage: body.options.titlePage }),
          },
          body.options?.strict ?? config.STRICT,
        );
        return sendResult(reply, outcome, body.filename);
      },
    );

    typedApp.post(
      "/convert/:themeId",
      {
        schema: {
          summary: "Convert a raw markdown body with an explicit theme",
          tags: ["conversion"],
          params: convertParametersSchema,
          querystring: convertQuerySchema,
          response: {
            200: z.string().describe("The converted document"),
          },
        },
      },
      async (request, reply) => {
        const markdown = typeof request.body === "string" ? request.body : "";
        const outcome = await runConversion(
          markdown,
          request.params.themeId,
          request.query.format,
          request.headers.accept,
          {},
          {},
          config.STRICT,
        );
        return sendResult(reply, outcome, request.query.filename);
      },
    );
  };

  return plugin;
};
