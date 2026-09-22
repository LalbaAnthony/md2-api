# md2

HTTP service converting Markdown into formatted documents. Multi theme, multi output format,
pure TypeScript, no external binary at runtime.

The project is named `md2`, never `md2docx`. No public identifier mentions `docx` outside the
DOCX backend itself.

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

```
docker compose -f docker/compose.yaml up dev
docker compose -f docker/compose.yaml run --rm test
docker compose -f docker/compose.yaml up prod
```

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

| File                                   | Contents                                               |
| -------------------------------------- | ------------------------------------------------------ |
| `docs/architecture.md`                 | pipeline, layering, error handling, containers         |
| `docs/units.md`                        | every unit, every conversion, every trap               |
| `docs/adr/0001-toolchain.md`           | retained versions                                      |
| `docs/adr/0002-branded-units.md`       | branded units and the assertion boundary               |
| `docs/adr/0003-lot-0-deviations.md`    | departures from the specification, with reasons        |
| `docs/adr/0004-theme-schema-mirror.md` | why the theme schema uses readonly wrappers and codecs |
| `docs/adr/0005-format-registration.md` | how backends are registered, and the scope of Lot 2    |

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

Quotes, callouts, page furniture, footnotes and mathematics arrive in Lots 8 to 10. Until then the DOCX backend reports each of them as a conversion warning rather than failing. `docs/theming.md`, `docs/formats.md`, `docs/adding-a-format.md`, `docs/api.md`,
`docs/ooxml-notes.md` and `docs/perf.md` arrive with the lots that make them meaningful.
