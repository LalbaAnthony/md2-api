# HTTP API

Every response carries `X-Request-Id`. An incoming `X-Request-Id` is reused when it matches
`[A-Za-z0-9._:-]{8,128}`, and replaced by a generated identifier otherwise.

The OpenAPI document is served at `/openapi.json` and committed to `docs/openapi.json`. Swagger UI
is available at `/docs` when `ENABLE_SWAGGER_UI` is set.

## Routes

| Method | Path              | Answers                                                             |
| ------ | ----------------- | ------------------------------------------------------------------- |
| `GET`  | `/healthz`        | liveness, the process is up                                         |
| `GET`  | `/readyz`         | readiness, themes loaded and formats warmed up                      |
| `GET`  | `/themes`         | the registered themes, with their origin and content hash           |
| `GET`  | `/themes/:id`     | one theme, its derived content box and the caveats of each format   |
| `GET`  | `/formats`        | the active output formats and their capabilities                    |
| `GET`  | `/formats/:id`    | one format, its capabilities and its caveats                        |
| `POST` | `/convert`        | the converted document                                              |
| `POST` | `/convert/:theme` | the same, with the theme in the path                                |
| `GET`  | `/preview`        | an editor with a theme and format selector, outside production only |

## Converting

```
POST /convert
Content-Type: application/json

{
  "markdown": "# Title\n\nA paragraph.\n",
  "theme": "corporate",
  "format": "docx",
  "filename": "quarterly-report",
  "metadata": { "title": "Quarterly report", "author": ["Ada Lovelace"] },
  "options": { "strict": false, "titlePage": true, "tableOfContents": true }
}
```

`markdown` is the only required field. A `text/markdown`, `text/x-markdown` or `text/plain` body
is accepted as the markdown itself, and then the theme comes from the path or from
`DEFAULT_THEME`.

Front matter in the document supplies the same metadata. The `metadata` field of the request wins
over the front matter, field by field.

### Response headers

| Header                  | Carries                                 |
| ----------------------- | --------------------------------------- |
| `Content-Type`          | the media type the backend declares     |
| `Content-Disposition`   | `attachment`, with the sanitised name   |
| `X-Convert-Ms`          | the total conversion time               |
| `X-Output-Format`       | the format that was used                |
| `X-Conversion-Warnings` | how many warnings the conversion raised |

A warning count above zero means the document was produced with a degradation. `GET /formats/:id`
lists what each format degrades, and strict mode turns every degradation into a refusal.

## Choosing the format

Precedence, strongest first:

1. `format` in the body of `POST /convert`.
2. `?format=` on `POST /convert/:theme`.
3. `Accept`, when a value matches the media type of an active backend exactly.
4. `DEFAULT_FORMAT`.

An `Accept` that is present, is not `*/*` and matches no active backend answers `406` with
`details.supported`.

## Errors

Every error uses one body:

```json
{
  "error": {
    "code": "THEME_NOT_FOUND",
    "message": "Unknown theme: ghost",
    "details": { "requested": "ghost", "available": ["default"] },
    "requestId": "6f1e9c0c-1a2b-4c3d-8e5f-7a9b0c1d2e3f"
  }
}
```

| Code                    | HTTP | Cause                                                             |
| ----------------------- | ---- | ----------------------------------------------------------------- |
| `VALIDATION_ERROR`      | 400  | invalid body or parameters, `details` carries the issues          |
| `PAYLOAD_TOO_LARGE`     | 413  | markdown beyond `MAX_MARKDOWN_BYTES`                              |
| `NESTING_TOO_DEEP`      | 422  | nesting beyond `MAX_NESTING_DEPTH`                                |
| `THEME_NOT_FOUND`       | 404  | unknown theme, `details.available` lists the identifiers          |
| `FORMAT_NOT_FOUND`      | 404  | unknown or disabled format                                        |
| `NOT_ACCEPTABLE`        | 406  | the `Accept` header cannot be satisfied                           |
| `UNSUPPORTED_NODE`      | 422  | a markdown node the pipeline does not handle, in strict mode      |
| `UNSUPPORTED_FEATURE`   | 422  | a construction needing a capability the format lacks, strict mode |
| `DIRECTIVE_ERROR`       | 422  | unknown directive or invalid attributes                           |
| `IMAGE_ERROR`           | 422  | image unreachable, outside the allowlist, or outside the bounds   |
| `THEME_EXTENSION_ERROR` | 422  | `theme.formats[format]` is invalid for that backend               |
| `CONVERSION_TIMEOUT`    | 504  | beyond `CONVERT_TIMEOUT_MS`                                       |
| `OVERLOADED`            | 503  | the queue is full or the process is under pressure, `Retry-After` |
| `INTERNAL`              | 500  | unexpected, logged with its stack, never returned in production   |

`NESTING_TOO_DEEP` is the one code beyond the table of the specification. See
`docs/adr/0003-lot-0-deviations.md`.

## Strict mode

`options.strict` turns every degradation into a refusal. It is the mode to use in a pipeline that
must not ship a silently altered document, and the mode to avoid in an interactive editor, where a
warning is more useful than an error. `STRICT` sets the default for the service.
