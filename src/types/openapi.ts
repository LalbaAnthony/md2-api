export interface OpenApiTag {
  readonly name: string;
  readonly description: string;
}

export interface OpenApiInfo {
  readonly title: string;
  readonly description: string;
  readonly version: string;
}

export interface OpenApiDocumentOptions {
  readonly openapi: string;
  readonly info: OpenApiInfo;
  readonly tags: readonly OpenApiTag[];
  readonly activeMediaTypes: readonly string[];
}
