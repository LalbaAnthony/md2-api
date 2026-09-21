# Architecture

`md2` converts Markdown into a binary document. The visual result is decided entirely by a theme,
and the output format is selectable. The service is built around a neutral intermediate
representation, the DocIR, and a registry of format backends. DOCX is the first backend, not the
only one planned.

## Pipeline

```
markdown -> parse -> normalize -> DocIR -> FormatRegistry.resolve(id) -> backend.convert -> result
```

| Stage          | Nature               | Responsibility                                                         |
| -------------- | -------------------- | ---------------------------------------------------------------------- |
| `parse`        | sync, pure           | Markdown to mdast, no rendering decision                               |
| `normalize`    | async, effectful     | everything needing a global view or input and output, produces DocIR   |
| `registry`     | sync                 | resolves a format identifier to a backend, applies content negotiation |
| `compileTheme` | async, backend owned | theme to the backend compiled form, cached per identifier and hash     |
| `render`       | sync, pure, total    | DocIR and compiled theme to the format tree, no input or output        |
| `pack`         | async, backend owned | binary serialisation                                                   |

The rule that keeps this honest: if a renderer needs an `await`, then `normalize` forgot
something. Fix `normalize`, never the renderer. An architecture test enforces it.

## Layering rules

- Nothing outside `src/formats/docx/**` imports the `docx` package or names an OOXML concept.
- A backend never reads a raw theme while rendering. It reads its own compiled form.
- Every `type` and `interface` is declared under `src/types/`. Logic modules import them with
  `import type`.
- Zod schemas are values, so they live next to their domain, not under `src/types/`. A test keeps
  each schema and its type in agreement.

## Why a DocIR

Two reasons, in this order.

**Format neutrality.** A shared DocIR is what allows a PDF, HTML or ODT backend to be added later
without touching parsing, normalisation, themes, image security or the test corpus.

**Flattening.** mdast nests blocks freely. Most document targets, DOCX first among them, expect a
flat sequence. A quote containing a list containing a code block has no native representation, so
it is flattened by propagating indentation, borders and overrides. The DocIR performs that
flattening once, explicitly, in `normalize`. Each renderer then becomes a local block to element
function that can be unit tested.

## Themes

A theme is not a format configuration. It is a set of semantic tokens that compile to the
configuration of a backend. Adding a theme changes no backend, and adding a backend changes no
theme.

`src/types/theme.ts` holds the interface, which is the source of truth. `src/theme/schema.ts`
holds the Zod mirror, proven equal to the interface by a type test, and
`docs/adr/0004-theme-schema-mirror.md` explains the two mechanisms that keep the mirror exact.

`src/theme/registry.ts` loads the built in themes first, then every `*.json` of `THEMES_DIR`, in
name order. A theme file must be named after the identifier it declares. A theme from the
directory overrides a built in theme of the same identifier, with a warning.

An invalid theme refuses the start in production. Outside production it is logged as an error and
excluded, so that the service stays usable while an author iterates. A theme directory that does
not exist is not an error: the production image ships no theme directory and runs on the built in
themes alone.

`src/theme/tokens.ts` derives what both the normaliser and the backends need from a theme:
`computeContentWidth` is the usable width that image and table sizing depend on, and the colour
helpers derive callout tints from a single accent colour.

Each theme carries a content hash. A backend caches its compiled form per identifier and hash, so
editing a theme in development invalidates exactly what it should. `ENABLE_THEME_WATCH` makes the
registry watch the directory and notify its listeners after a debounce.

## Error handling

`src/errors.ts` owns the single `AppError` hierarchy and the exhaustive code to status mapping.
A single `setErrorHandler` in `src/server.ts` renders the shared envelope and decides what is
exposed: outside production the body carries `stack` and `cause`, in production an internal
failure is reduced to its code, a generic message and the request identifier.

Every response carries `X-Request-Id`. An incoming `X-Request-Id` is reused when it matches
`REQUEST_ID_PATTERN`, and replaced by a generated identifier otherwise, so that a caller cannot
inject arbitrary content into logs or headers.

## Configuration

`src/config.ts` validates the environment once at startup and refuses to start on any violation.
Production forbids the preview route, theme watching, and remote images without an allowlist.
Raw HTML is locked off and cannot be enabled by configuration.

Boolean environment variables are parsed by an explicit accept list rather than by coercion.
`Boolean("false")` is `true` in JavaScript, and a security switch must never fail open. See
`docs/adr/0003-lot-0-deviations.md`.

## Docker

- `bookworm-slim` rather than Alpine: `sharp` on musl needs either a source build or fragile
  prebuilt binaries. The size saving does not pay for the maintenance cost.
- The installed fonts are not embedded in the produced document, which references fonts by name.
  They exist to rasterise text bearing SVG images and, in the test image, to render with
  LibreOffice. The fonts of the test image are frozen: changing them invalidates every visual
  baseline.
- The test image is deliberately separate, above 700 MiB, and never deployed.
- `--enable-source-maps` costs almost nothing next to the cost of unreadable compiled stacks.
- Production runs read only, with all capabilities dropped, as a non root user. The service never
  writes to disk. Any write attempt is a design defect.

## Conformance tooling

A constraint that is not tooled is a dead constraint. Four local ESLint rules under
`tools/eslint-rules/` enforce the comment ban, the character ban, the type placement rule and the
format isolation rule. `tools/check-repository-charset.mjs` applies the character ban to every
tracked file and to commit messages, through the hooks in `.githooks/`.
`tests/unit/architecture.test.ts` repeats the same checks as tests, on purpose: a locally disabled
ESLint rule stays visible in the suite.
