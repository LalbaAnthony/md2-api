# Output formats

A format backend is the only module that knows a file format. Everything before it, parsing,
normalisation and theming, is neutral.

## Active formats

`GET /v1/formats` lists what the running service can produce. The list depends on the environment:
production registers only backends that declare themselves production ready, and refuses to start
if `ENABLED_FORMATS` names one that is not, or one that no backend implements.

| Format       | Media type                                                                | Production |
| ------------ | ------------------------------------------------------------------------- | ---------- |
| `docx`       | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | yes        |
| `debug-json` | `application/json`                                                        | no         |

## Capabilities

Each backend declares what it can render natively. A caller reads them from `GET /v1/formats/:id` and
knows what to expect before sending anything.

| Capability           | `docx`          | `debug-json` |
| -------------------- | --------------- | ------------ |
| `pagination`         | yes             | no           |
| `pageChrome`         | yes             | no           |
| `titlePage`          | yes             | no           |
| `tableOfContents`    | `deferredField` | `none`       |
| `footnotes`          | `native`        | `inline`     |
| `math`               | `source`        | `source`     |
| `syntaxHighlighting` | yes             | yes          |
| `columns`            | yes             | no           |
| `landscapeSections`  | yes             | no           |
| `vectorImages`       | no              | no           |
| `maxListDepth`       | 9               | 64           |

A capability is a promise. `landscapeSections` is true for DOCX because `:::landscape` really
produces a landscape section, not because the directive is accepted and ignored.

## How a format degrades

The pipeline never degrades anything by itself. The backend decides, and says so twice: in the
`caveats` of its descriptor, and in the warnings of each conversion, counted in the
`X-Conversion-Warnings` header and written to the log with the request identifier.

In strict mode a construction that needs a capability the format does not have is a
`422 UNSUPPORTED_FEATURE` instead of a degraded render.

## The DOCX backend

Produces a Word document with named styles only, so a reader can restyle the whole document by
editing a style rather than hunting through direct formatting.

Known caveats, all reported by `GET /v1/formats/docx`:

- The table of contents is a field. It is inserted but not resolved, so what the reader sees before
  the fields are refreshed depends on the reader: Word refreshes on opening, because the backend
  sets `updateFields`, while LibreOffice shows the instruction text of the field until the reader
  presses F9. The visual baselines are rendered by LibreOffice and show that instruction.
- Fonts are referenced by name and never embedded. The reader needs them installed.
- Vector images are rasterised during normalisation. The document carries no SVG.
- Word silently truncates list nesting beyond nine levels, so the backend clamps and warns.
- Mathematics is rendered as its LaTeX source. See `docs/adr/0007-mathematics-chain.md`.
- The `chapter` slot of a header is a `STYLEREF` field, and the vertical alignment of a title page
  section is honoured by Word but dropped by LibreOffice on import. Both show in the visual
  baselines, which are rendered by LibreOffice.

Its theme extension accepts `styleIdPrefix`, `compatibilityModeVersion` and `updateFieldsOnOpen`.
The JSON Schema is published at `GET /v1/formats/docx`.

## The debug-json backend

Serialises the intermediate representation as deterministic JSON. It exists to prove mechanically
that the pipeline has no dependency on DOCX, and to give theme and directive authors a way to see
exactly what the pipeline produced. It is never registered in production, and `POST /v1/convert` with
`format: "debug-json"` answers 404 there.

Image bytes are replaced by their length and digest, so the output stays small and stable.

## Choosing a format

Precedence, strongest first:

1. `format` in the body of `POST /v1/convert`
2. `?format=` on `POST /v1/convert/:themeId`
3. an `Accept` header that exactly matches the media type of an active backend
4. `DEFAULT_FORMAT`

An `Accept` header that is present, is not `*/*`, and matches no active backend gives
`406 NOT_ACCEPTABLE` with the supported media types in the details.
