# MD2 API

HTTP service converting Markdown into formatted documents. Multi theme, multi output format,
pure TypeScript, no external binary at runtime.

## Requirements

- Node.js 22 LTS or newer
- Docker, for the test and production images

## Getting started

```
npm ci
npm run dev
```

```
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/readyz
```

## Scripts

| Script                  | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run build`         | compile to `dist/`                                                |
| `npm run typecheck`     | compile sources and tests without emitting                        |
| `npm run lint`          | ESLint, including the four local conformance rules, zero warnings |
| `npm run check:charset` | reject emoji and long dashes in every tracked file                |
| `npm run format`        | Prettier write                                                    |
| `npm test`              | the whole suite runnable outside Docker                           |
| `npm run test:unit`     | unit and architecture tests                                       |
| `npm run test:contract` | HTTP contract tests through `app.inject()`                        |
| `npm run test:golden`   | golden snapshot tests                                             |
| `npm run test:visual`   | visual regression, meaningful inside the test image only          |
| `npm run test:all`      | the reference command, runs everything in the test container      |

## Containers

```sh
cp .env.example .env
docker compose --profile dev up dev
docker compose run --rm test

cp .env.prod.example .env.prod
docker compose --env-file .env.prod --profile prod up prod
```

The server always listens on port 3000 inside its container. `PORT` and `DEBUG_PORT` are the
host ports Compose publishes it on, and both are required. `dev` reads its configuration from
`.env`, `prod` from `.env.prod`, and `prod` must be started with `--env-file .env.prod` so that
its `PORT` comes from that file. Run outside Docker, the server listens on 3000 and reads no env
file.

The production service runs read only, with all capabilities dropped, as a non root user.

## Repository conventions

These are enforced mechanically, not by review.

- No comment anywhere under `src/` or `tests/`. Explanations live in `docs/`.
- No emoji, no en dash, no em dash, in any tracked file or commit message.
- Every `type` and `interface` is declared under `src/types/`.
- No `any`, no compiler suppression comment, no type assertion outside the two sanctioned
  boundaries described in `docs/adr/0002-branded-units.md`.
- No layout length travels as a bare `number`. See `docs/units.md`.
- Nothing outside `src/formats/docx/**` imports the `docx` package.

Install the hooks once with `npm run prepare`, which points `core.hooksPath` at `.githooks/`.

## Documentation

| File                                   | Contents                                                  |
| -------------------------------------- | --------------------------------------------------------- |
| `docs/architecture.md`                 | pipeline, layering, error handling, containers            |
| `docs/api.md`                          | routes, request shape, headers and every error code       |
| `docs/security.md`                     | the attack surface audit, one vector at a time            |
| `docs/perf.md`                         | measured figures, the load test and the soak              |
| `docs/ooxml-notes.md`                  | what the DOCX backend had to learn about WordprocessingML |
| `docs/units.md`                        | every unit, every conversion, every trap                  |
| `docs/adr/0001-toolchain.md`           | retained versions                                         |
| `docs/adr/0002-branded-units.md`       | branded units and the assertion boundary                  |
| `docs/adr/0003-lot-0-deviations.md`    | departures from the specification, with reasons           |
| `docs/adr/0004-theme-schema-mirror.md` | why the theme schema uses readonly wrappers and codecs    |
| `docs/adr/0005-format-registration.md` | how backends are registered, and the scope of Lot 2       |
| `docs/adr/0008-visual-regression.md`   | the pixel comparison chain and its tolerances             |
| `docs/theming.md`                      | every theme section, its units and its refusals           |
| `docs/formats.md`                      | the active formats, their capabilities and negotiation    |
| `docs/adding-a-format.md`              | the six steps that add a backend                          |

## Delivery status

Lot 0 is complete: tree, strict toolchain, conformance tooling, unit system, error hierarchy,
configuration, minimal server with `/healthz` and `/readyz`, containers and CI.

Lot 1 is complete: the theme interface and its proven Zod mirror, the token helpers, the theme
registry with its production and development behaviours, the `default` theme, and the `/themes`
and `/themes/:id` routes.

Lot 2 is complete: the backend contract, the format registry, content negotiation, the
`debug-json` backend and the `/formats` and `/formats/:id` routes.

Lot 3 is complete: `parse`, the front matter, link and anchor passes, the flattening to the
intermediate representation for paragraphs, headings, thematic breaks and the full inline set,
a minimal DOCX backend with compiled styles and numbering, `POST /convert` and
`POST /convert/:themeId`, the OpenAPI document with Swagger UI, and the first golden snapshots.

Lot 4 is complete: list numbering with one instance per root list, nine levels of nesting, loose
and tight lists, multi block items and task lists.

Lot 5 is complete: Shiki tokenisation in the pipeline, semantic scopes projected to theme colours
by the backend, the single cell table wrapper, line numbers, the language label, tab expansion and
the plain text fallback for an unknown language.

Lot 6 is complete: deterministic column widths that fill the usable width exactly, fixed layout, repeated header row, stripes, column alignment, inline formatting in cells and numbered captions.

Lot 7 is complete: image resolution from data URIs, local files and guarded remote fetches, SVG rasterisation, resizing, the bounds of section 16, the `::figure` directive and numbered captions.

Lot 8 is complete: nested quotes, every callout variant, the page break, landscape and column directives, strict attribute validation, and degradation with a warning outside strict mode.

Lot 9 is complete: headers and footers laid out with tab stops, page numbers and counts, the chapter field, the title page with its own section, and the table of contents field.

Lot 10 is complete: footnotes numbered in order of first reference, multi block notes, and the LaTeX to MathML chain with the documented source fallback for DOCX.

Lot 11 is complete: the `corporate`, `academic` and `technical` themes beside `default`, the DOCX
theme extension and its schema, the `kitchen-sink` corpus that all four themes render without a
single warning in strict mode, the `/preview` page with its theme and format selectors, and
`docs/theming.md`, `docs/formats.md` and `docs/adding-a-format.md`.

Lot 12 is complete: the DOCX to PDF to PNG chain in the test image, `pixelmatch` comparison
against versioned baselines with a per pixel threshold of 0.1 and a page tolerance of 0.1 percent,
the matrix of four themes across four reference documents, regeneration by
`npm run test:visual -- --update`, and the CI step that runs it in the container.

Lot 13 is complete: the attack surface of section 12.1 audited row by row in
`tests/contract/security-surface.test.ts` and `docs/security.md`, the conversion log line held to
the fields of section 12.3 with a test that proves the markdown never reaches a log, a
`NESTING_TOO_DEEP` code so that the nesting bound answers 422 as the specification requires, the
load and soak tooling under `tools/`, and `docs/api.md`, `docs/perf.md`, `docs/security.md` and
`docs/ooxml-notes.md`.

`under-pressure`, `helmet`, the graceful shutdown and the readiness probes landed with the lots
that needed them and are covered by the contract suite.

Every lot of section 19 is delivered. What remains open is listed in `docs/adr/` as a deviation
with its reason, and the extensions of section 19.1 are deliberately out of the V1.
