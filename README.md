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

| File                                | Contents                                        |
| ----------------------------------- | ----------------------------------------------- |
| `docs/architecture.md`              | pipeline, layering, error handling, containers  |
| `docs/units.md`                     | every unit, every conversion, every trap        |
| `docs/adr/0001-toolchain.md`        | retained versions                               |
| `docs/adr/0002-branded-units.md`    | branded units and the assertion boundary        |
| `docs/adr/0003-lot-0-deviations.md` | departures from the specification, with reasons |

## Delivery status

Lot 0 of the specification is complete: tree, strict toolchain, conformance tooling, unit system,
error hierarchy, configuration, minimal server with `/healthz` and `/readyz`, containers and CI.

Later lots add the theme model, the format registry, the conversion pipeline and the DOCX
backend. `docs/theming.md`, `docs/formats.md`, `docs/adding-a-format.md`, `docs/api.md`,
`docs/ooxml-notes.md` and `docs/perf.md` arrive with the lots that make them meaningful.
