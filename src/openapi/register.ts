import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { openApiDocumentOptions } from "./document.ts";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../types/config.ts";
import type { FormatRegistry } from "../types/format.ts";

export const OPENAPI_DOCUMENT_ROUTE = "/openapi.json";
export const SWAGGER_UI_ROUTE = "/docs";

export const registerOpenApi = async (
  app: FastifyInstance,
  config: AppConfig,
  formats: FormatRegistry,
): Promise<void> => {
  const options = openApiDocumentOptions(formats.list());

  await app.register(swagger, {
    openapi: {
      openapi: options.openapi,
      info: options.info,
      tags: [...options.tags],
    },
    transform: jsonSchemaTransform,
  });

  app.get(OPENAPI_DOCUMENT_ROUTE, { schema: { hide: true } }, (_request, reply) =>
    reply.send(app.swagger()),
  );

  if (config.ENABLE_SWAGGER_UI) {
    await app.register(swaggerUi, {
      routePrefix: SWAGGER_UI_ROUTE,
      uiConfig: { docExpansion: "list", deepLinking: true },
      staticCSP: true,
    });
  }
};
