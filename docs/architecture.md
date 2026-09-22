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

## Output formats

A backend owns everything that knows a file format: the compiled form of a theme, the renderer and
the serialiser. `src/types/format.ts` declares the contract, and it is deliberately not generic:
the compiled theme never appears in a public signature, which lets the registry hold a homogeneous
collection of backends with no type assertion and no existential type.

`src/formats/registry.ts` builds the backend table from `NODE_ENV` and `ENABLED_FORMATS`. The
rules, and why one of them is temporarily permissive, are in
`docs/adr/0005-format-registration.md`. `src/formats/negotiate.ts` implements the selection
precedence of section 10.4 and depends on no concrete backend.

A backend declares its capabilities rather than having them inferred. The pipeline degrades
nothing by itself: the backend decides how to render what it does not support natively, and says
so in the conversion warnings and in `describeThemeCaveats`, which is what `GET /themes/:id` and
`GET /formats/:id` report.

`debug-json` exists to prove mechanically that the pipeline has no dependency on DOCX, and to give
theme and directive authors a diagnostic view. It is never registered in production.

Each backend also validates its own slice of `theme.formats`, and the server passes those
validators to the theme registry, so an invalid extension is caught when the theme is loaded
rather than when a conversion is attempted.

## The pipeline

`src/pipeline/parse.ts` holds the unified processor and nothing else. It carries no transform
plugin, so `parseMarkdown` returns raw mdast and every decision belongs to `normalize`.

`src/pipeline/normalize/` runs its passes in the order of section 5.3. As of this lot the order
is front matter, link references, anchors, flatten. Each pass consumes the result of the
previous one, and the warning sink is threaded through all of them so that a single conversion
reports every degradation at once.

Anchors come from one `GithubSlugger` instance walking the headings in document order. The same
table resolves internal links, so a duplicate heading and the link pointing at it always agree.
Two instances would mean two duplicate counters and dead links.

`src/pipeline/convert.ts` is the orchestrator: it checks the input size, parses, normalises,
calls the backend, and merges the warnings of the pipeline with those of the backend. It is
wrapped in a timeout, and the route wraps it in a semaphore bounded by `MAX_CONCURRENCY` with a
queue of `MAX_CONCURRENCY * 8`, beyond which a request is refused immediately rather than
queued without bound.

The timeout bounds the awaited pipeline. It cannot interrupt a synchronous renderer, which is
one more reason the renderers stay small and total.

## Lists

A list is flattened, like everything else. Each item becomes one `listItem` block carrying its own
content blocks, and a nested list becomes further `listItem` blocks that follow it with a deeper
`level`. Nothing in the intermediate representation nests lists inside lists.

Every root list gets a fresh instance number, shared by all its descendants. That number becomes a
distinct concrete numbering in the produced document, which is what makes two consecutive ordered
lists restart at one instead of continuing. This is the regression that section 5.5 calls the
first one to expect, so `tests/golden/corpus/consecutive-lists.md` exists for it and a unit test
asserts the instance numbers directly.

An item with several blocks carries the numbering on its first paragraph only. The following
paragraphs get the matching indentation and no numbering, otherwise the bullet repeats on every
paragraph of the item.

A task item uses no numbering at all. It is indented explicitly and its first paragraph is
prefixed by a glyph run followed by a non breaking space, in the monospace font. Word content
controls would be the alternative, and they are out of proportion and poorly supported outside
Word itself.

Nine levels is the limit Word honours. `normalize` never clips: it records the real depth, and the
backend clamps to its own `maxListDepth` and emits a conversion warning, because the limit belongs
to the format and not to the document.

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
