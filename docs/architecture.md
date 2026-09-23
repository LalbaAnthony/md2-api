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

Four themes ship built in. `default` is the neutral reference. `corporate` adds a title page, a
running header and footer, accented headings with a rule and striped tables. `academic` sets a
serif face on double leading, justified and indented paragraphs, numbered headings and tables
ruled horizontally only. `technical` is dense: ten point sans on narrow margins, numbered code
lines with a language label and tinted callouts. `docs/theming.md` documents every section, and
`tests/unit/builtin-themes.test.ts` holds each theme to the same bar, which is that it renders
`tests/golden/corpus/kitchen-sink.md` in strict mode without emitting a warning.

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
so in the conversion warnings and in `describeThemeCaveats`, which is what `GET /v1/themes/:id` and
`GET /v1/formats/:id` report.

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

## Code blocks

Tokenisation belongs to `normalize`, not to a backend. Shiki runs once per code node, behind a
process singleton that loads a grammar the first time a language needs it. Loading the highlighter
per request costs hundreds of milliseconds, so the server warms it up before `/readyz` answers.

What lands in the intermediate representation is a semantic scope per token, never a colour. The
projection from TextMate scope names to `SyntaxScope` lives in `src/pipeline/normalize/code.ts`
and matches on the most specific scope of each token. The backend turns a scope into a colour
through `theme.syntax`, which is what lets one tokenisation serve every theme and every format.

Tabs are expanded to the next tab stop during normalisation, using `code.tabWidth`. Word reads a
tab as a tab stop rather than an indent, so a tab that survived to the document would not line up.

An unknown language is never an error. The block falls back to one plain token per line and a
conversion warning, as section 11.6 requires.

The block itself is a table of one cell with the shading on the cell, not on the paragraphs.
Paragraph shading leaves white gaps between lines in several renderers and does not rebuild
cleanly after a page break. Each line stays its own paragraph inside that cell and the row never
forbids splitting, so a long block breaks across pages with a continuous background.

## Tables

Word autofit is not deterministic between versions and platforms, so nothing is left to it. The
layout is fixed, the grid is explicit, and the column widths are decided during normalisation.

`computeColumnWidths` in `src/pipeline/normalize/tables.ts` measures the longest value of each
column, header included, clips each measure at sixty characters so one verbose cell cannot absorb
the table, distributes the usable width in proportion, raises any column that falls below
`table.minColumnWidth` and takes the deficit from the columns in excess, then puts the rounding
residue on the last column. The sum of the widths equals the usable width exactly, which is
asserted over fifty generated cases and for every column count up to twenty.

When the floor cannot be honoured at all, because the columns are too many for the page, the
width is split equally rather than pretending the floor still holds.

A cell never carries bare text: its phrasing content becomes one paragraph, and the column
alignment is applied to that paragraph rather than to the cell. The header row is marked so Word
repeats it on each page, and stripes are computed by row index in the renderer rather than stored
in the intermediate representation.

A caption carries a `SEQ` field so that Word renumbers it when a reader inserts a table. The
counters in the intermediate representation exist for cross references in text, not for the
number the reader sees.

## Images

This is the most exposed module of the project, and the one with the largest test suite.

Remote fetching is off by default. When it is on, a URL must be https, its host must match the
allowlist exactly or by domain suffix, and the host is resolved once. Every address the resolver
returns is checked against the private, loopback, link local, carrier grade, benchmark, multicast
and reserved ranges, IPv4 and IPv6, including IPv4 mapped IPv6 forms, so that
`::ffff:169.254.169.254` is refused like `169.254.169.254`. The connection then goes to that
validated address through a pinned lookup, which is what closes the DNS rebinding window between
the check and the connection.

Redirects are followed at most twice and each hop repeats every check, so a redirect cannot leave
the allowlist, drop to plain http, or reach a private address. The response body is read with a
running byte count and the read stops as soon as the limit is passed, rather than after the fact.

The format is decided by the bytes, never by a declared content type or a file extension. Bytes
that match no known signature are refused.

A local path is refused unless `ALLOW_LOCAL_IMAGES` is set, must be relative, and is resolved and
then checked to be inside `ASSETS_DIR`, so a traversal cannot escape it.

Every SVG is rasterised to PNG. The density is derived so that the raster is about twice the
target render width, capped at 300 dpi, which means a vector drawing stays sharp without producing
an enormous bitmap. WebP, AVIF and TIFF are converted to PNG for the same reason: a reader cannot
be assumed to understand them.

Resizing is constrained by the usable width, the theme ratio and the directive ratio, keeps the
aspect ratio, and never enlarges beyond the intrinsic size. Every failure of the whole chain is an
`IMAGE_ERROR`, including failures coming out of the imaging library, so a malformed image is a 422
and never a 500. Outside strict mode an unusable image degrades to its alternative text with a
warning.

## Quotes, callouts and directives

A quote is not a container in the intermediate representation. Its paragraphs are flattened with
`insideQuote` set and an `indentLevel` that grows with the nesting, and the renderer multiplies the
theme indent by that depth. A quote inside a quote inside a quote indents three times, and a list
inside a quote keeps its own numbering.

A callout is a table of one cell, like a code block, for the same reason: it is the only OOXML
construction that gives a continuous background and border across several paragraphs. The left bar
carries the colour of the variant and the background is that colour mixed at twelve percent on
white, computed once in `theme/tokens.ts`. The variant label is always textual, never a pictogram,
which C8 requires.

Every directive validates its attributes against a strict schema. What happens next depends on the
mode, and this is the rule the specification cares about most: in strict mode an unknown directive
or an invalid attribute is a 422, and outside strict mode it produces a warning and degrades. A
container degrades to its own children rendered bare, so no text is ever lost, and a leaf directive
degrades to nothing.

`:::landscape` and `:::columns` bracket their content with two section markers, one that applies
the override and one that restores the theme default. The DOCX backend splits the flat element list
at those markers into several OOXML sections, swapping the page size for a landscape section and
setting the column count for a column section. This is what makes the `landscapeSections` and
`columns` capabilities of the backend true rather than decorative.

## Page furniture

A header or a footer is one paragraph with two tab stops, one centred at half the content width and
one right aligned at the full width. Three slots fill the left, the centre and the right. A table
would have been the obvious alternative and is the wrong one: a table in a footer complicates
pagination in several readers.

A slot is literal text, a metadata field, the current page number, the total page count, a chapter
reference or nothing. The chapter slot is a `STYLEREF` field on the `Heading 1` style, so the
reader keeps it up to date as the pages turn, rather than a value frozen at generation time.

The title page is built from the document metadata. When the theme breaks after it, it becomes its
own section, so the body starts on a fresh page with its own furniture. When it does not, the body
section sets `titlePg`, which is how OOXML expresses a different first page.

The table of contents is a field. It is inserted, never resolved: the document carries a `TOC`
field and `updateFields`, which LibreOffice applies silently and for which Word prompts on opening.
A truly pre paginated table of contents would need a full layout engine, which is out of scope, so
the DOCX capability is `deferredField` and the caveat is reported by `GET /v1/formats/docx`.

The effective flags come from the theme and can be overridden per request, which is recorded in
`docs/adr/0006-lot-3-pipeline-and-docx.md`.

## Footnotes and mathematics

Footnotes are collected during normalisation and numbered in the order of their first reference,
not the order of their definitions, so a note defined last but referenced first is number one. A
repeated reference reuses its number. A definition that is never referenced produces a warning and
no note. The definitions are removed from the flow and passed to the document as a whole, and a
note keeps every block it contains, including lists.

An unmatched reference never reaches the flattener, because GFM parses `[^missing]` as literal
text when no definition matches. The guard that warns, or fails in strict mode, is kept for a pass
that injects references and is covered by a test that builds such a tree directly.

Mathematics goes only half way. `normalize` turns LaTeX into MathML with KaTeX, so the
intermediate representation carries both the source and the MathML and stays neutral. The DOCX
backend does not translate MathML to OMML: it renders the source, warns, and declares its
`math` capability as `source`. The reasoning, and what implementing OMML would cost, is in
`docs/adr/0007-mathematics-chain.md`.

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

## Golden snapshots

`tests/golden` converts every corpus file with every registered backend and compares the result
with a committed snapshot. DOCX goes through the five normalisation steps of the specification,
which drop volatile attributes and turn relationship identifiers into ordinals through a
substitution table.

The `debug-json` backend prints the digest and the byte length of every asset, and a rasterised
vector image is not reproducible across machines: libvips, its rendering of text and the installed
fonts all move the bytes. The digest and the length of an asset whose source is an SVG are
therefore replaced by a fixed marker before the comparison, while every raster asset keeps its
real digest, because a PNG that crosses the pipeline unchanged has the same bytes everywhere.

## Visual regression

The golden snapshots compare normalised OOXML, which proves structure and not appearance. A wrong
font size is a two character diff in a snapshot and a visibly wrong document on a page, so the
matrix of `tests/visual` converts each document to PDF with LibreOffice, rasterises every page
with `pdftoppm` at 96 dots per inch, and compares against
`tests/visual/baseline/{format}/{theme}/{corpus}-{page}.png` with `pixelmatch`, a per pixel
threshold of 0.1 and a page tolerance of 0.1 percent of the pixels.

The matrix is the four built in themes across `kitchen-sink`, `tables-wide-content`,
`code-highlighted-ts` and `lists-mixed-nested`. It runs in the test image only, where LibreOffice,
freetype and the fonts are pinned, and is skipped elsewhere. `npm run test:visual -- --update`
regenerates the baselines, and the diff of that regeneration is reviewed by a human in code
review, which is the only place a wrong rendering becomes visible.

`docs/adr/0008-visual-regression.md` records the chain, the tolerances and what was rejected.

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

## Security and performance

`docs/security.md` walks the attack surface of section 12.1 row by row, naming the mitigation and
the test that holds it. `docs/perf.md` carries the measured figures, the phases a conversion
spends its time in, the behaviour under load and the memory drift over ten thousand conversions,
along with the commands that produce them.

## Conformance tooling

A constraint that is not tooled is a dead constraint. Four local ESLint rules under
`tools/eslint-rules/` enforce the comment ban, the character ban, the type placement rule and the
format isolation rule. `tools/check-repository-charset.mjs` applies the character ban to every
tracked file and to commit messages, through the hooks in `.githooks/`.
`tests/unit/architecture.test.ts` repeats the same checks as tests, on purpose: a locally disabled
ESLint rule stays visible in the suite.
