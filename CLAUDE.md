# CLAUDE.md

## Overview

`md2-api` is the API of the MD2 project: an HTTP service (package name `md2`) converting Markdown
into formatted binary documents. Rendering is driven entirely by a theme, the output format is
selectable through a backend registry. DOCX is the only production format; `debug-json` exists
for development and tests.

MD2 is made of three sibling repositories, always side by side in the same parent directory:

| Repository    | Role                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `md2-api`     | this repository, the API                                                                       |
| `md2-front`   | the frontend                                                                                   |
| `md2-project` | project configuration and management; `api/specifications.md` is the binding API spec (French) |

## Tech stack

- TypeScript 6 (strict, `nodenext` ESM, `.ts` extensions in relative imports), Node.js `>=22`
  (images use `node:22-bookworm-slim`)
- Fastify 5, Zod 4 (`fastify-type-provider-zod`), `@fastify/swagger` + `swagger-ui` (OpenAPI 3.1)
- unified / remark (GFM, directive, frontmatter, math), Shiki, KaTeX, `docx`, `sharp`, `undici`,
  pino
- Vitest 5 (+ v8 coverage), ESLint 10 + typescript-eslint `strictTypeChecked`, Prettier 3
- npm (`package-lock.json`), Docker Compose

## Structure

| Path                                               | Role                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/index.ts`                                     | process entry: config, server, graceful shutdown, listens on `0.0.0.0:3000`              |
| `src/server.ts`                                    | `buildServer()`: plugins, error handler, route registration                              |
| `src/config.ts`                                    | env validation (Zod), refuses to start on any violation                                  |
| `src/constants.ts`                                 | `SERVER_PORT`, `API_VERSION_PREFIX` (`/v1`), limits, redaction paths                     |
| `src/errors.ts`                                    | single `AppError` hierarchy and code to status mapping                                   |
| `src/routes/`                                      | `health`, `themes`, `formats`, `convert`, `preview`                                      |
| `src/pipeline/`                                    | `parse.ts`, `normalize/*` (passes producing the DocIR), `convert.ts` orchestrator        |
| `src/formats/`                                     | `registry.ts`, `negotiate.ts`, one directory per backend (`docx/`, `debug-json/`)        |
| `src/theme/`                                       | theme registry, Zod schema, tokens, `builtin/` (default, corporate, academic, technical) |
| `src/types/`                                       | every `type` / `interface` of the project, declarations only                             |
| `src/lib/`                                         | shared helpers (cache, semaphore, rate limit, hash, readiness, ...)                      |
| `src/openapi/`                                     | OpenAPI document and examples                                                            |
| `tests/unit/`                                      | unit and architecture tests                                                              |
| `tests/contract/`                                  | HTTP contract tests via `app.inject()`                                                   |
| `tests/golden/`                                    | `corpus/*.md` and `__snapshots__/{debug-json,docx}/`                                     |
| `tests/visual/`                                    | pixel regression, `baseline/{format}/{theme}/{corpus}-{page}.png`                        |
| `tests/helpers/`                                   | test server builder, normalisers, fixtures                                               |
| `themes/`                                          | runtime theme directory (`THEMES_DIR`), `example.json`                                   |
| `tools/`                                           | charset check, OpenAPI export, hook installer, perf tools, local ESLint rules            |
| `docs/`                                            | architecture, API, security, perf, theming, formats, `adr/`, `openapi.json`              |
| `apache.conf`                                      | Apache2 reverse proxy reference for production (see Gotchas)                             |
| `Dockerfile.{dev,test,prod}`, `docker-compose.yml` | containers, profiles `dev`, `test`, `prod`                                               |

## Commands

Setup:

```sh
npm ci
npm run prepare        # sets core.hooksPath to .githooks/
cp .env.example .env
```

Run:

```sh
npm run dev                                   # tsx watch, port 3000, reads no env file
docker compose --profile dev up dev           # uses .env, inspector on DEBUG_PORT
npm run build && npm start                    # compiled dist/index.js
```

Quality:

```sh
npm run lint            # ESLint, zero warnings, includes local md2/* rules
npm run typecheck       # src + tests, no emit
npm run check:charset   # emoji / en dash / em dash ban on every tracked file
npm run format          # Prettier write
npm run format:check
```

Tests:

```sh
npm test                    # whole suite outside Docker (visual tests skip)
npm run test:unit
npm run test:contract
npm run test:golden
npm run test:visual         # meaningful only in the test image
npm run test:all            # reference: docker compose run --rm test
npm run test:watch
```

Snapshots and generated artifacts:

```sh
npm run test:golden -- --update
docker compose run --rm test npm run test:visual -- --update
npm run build && npm run openapi:export       # regenerate docs/openapi.json
node tools/export-openapi.mjs --check          # CI check, requires a build
```

Perf: `npm run perf:load`, `npm run perf:soak` (see `docs/perf.md`).

Production container:

```sh
cp .env.prod.example .env.prod
docker compose --env-file .env.prod --profile prod up prod
```

## Architecture

```
markdown -> parse -> normalize -> DocIR -> FormatRegistry.resolve(id) -> backend.convert -> result
```

- `parse` is sync and pure (raw mdast, no plugin transforms). `normalize` does all async and global
  work (front matter, links, anchors, images, code tokenisation, footnotes, math, flatten) and emits
  a flat DocIR plus warnings.
- A backend owns compile theme (cached per id + content hash), `render` (sync, pure, total), and
  `pack`. If a renderer needs `await`, fix `normalize` instead.
- `convert.ts` enforces size and timeout; the route wraps it in a semaphore of `MAX_CONCURRENCY`
  with a queue of `MAX_CONCURRENCY * 8`, beyond which requests are refused.
- Routes: business routes under `/v1` (`/v1/convert`, `/v1/convert/:themeId`, `/v1/themes`,
  `/v1/formats`, ...). `/healthz`, `/readyz`, `/openapi.json`, `/docs`, `/preview` stay at the root.
  Unprefixed business paths return 404.
- Themes: built-ins load first, then `THEMES_DIR/*.json` in name order (file name must equal the
  theme id; directory themes override built-ins). Invalid theme blocks startup in production only.
- Adding a format: follow `docs/adding-a-format.md` (`OutputFormatId`, `src/types/<id>-*.ts`,
  `src/formats/<id>/`, registry entry, golden snapshots).
- Deep references: `docs/architecture.md`, `docs/api.md`, `docs/security.md`, `docs/units.md`,
  `docs/adr/`.

## Conventions

Enforced by ESLint, `tests/unit/architecture.test.ts`, and git hooks:

- No comments anywhere in `src/` or `tests/` (`md2/no-comments`). Explanations go in `docs/`.
- No emoji, en dash or em dash in any tracked file or commit message.
- Every `type` / `interface` lives in `src/types/`; `src/types/` holds no runtime values. Import
  with `import type` (separate type imports).
- No `any`, no `@ts-*` comments, no non-null assertion, no enums (use literal unions).
- No type assertions, except `src/units.ts` (branded units) and `as` in `src/config.ts`,
  `src/theme/registry.ts`, `src/formats/docx/theme-extension.ts` (raw JSON boundary).
- Layout lengths are branded units, never bare `number` (`docs/units.md`).
- `docx` package imported only under `src/formats/docx/**` (type-only exception:
  `src/types/docx-*.ts`). No backend imports another backend. Renderers never import
  `src/types/theme.ts`, only their compiled theme.
- Zod schemas live next to their domain, not in `src/types/`.
- The name `docx` must not appear in public identifiers outside the DOCX backend.
- Prettier: 100 cols, double quotes, semicolons, trailing commas, LF.
- Deviations from `md2-project/api/specifications.md` must be recorded in `docs/adr/`.
- Git (`docs/git.md`): Conventional Commits (`feat:`, `fix:`, `ref:`, `chore:`, `docs:`, `test:`),
  branches `feat/`, `fix/`, `ref/`, `docs/`, `test/` from `develop`, PRs into `develop` then `main`.

## Testing

- Vitest, `tests/**/*.test.ts`, node environment.
- Single file / single test:

  ```sh
  npx vitest run tests/unit/units.test.ts
  npx vitest run tests/unit/units.test.ts -t "<test name>"
  ```

- Coverage (CI runs `npx vitest run tests/unit tests/contract --coverage`): 85% global, 95% for
  `src/units.ts`, `src/errors.ts`, `src/theme/schema.ts`.
- Golden matrix is built from the format registry: every corpus file runs against every registered
  backend. Review snapshot diffs before committing.
- Visual tests skip unless `IN_DOCKER` is set; the test image pins LibreOffice, poppler and fonts.
  Failing pages write diffs to `tests/visual/diff/` (ignored).
- Contract tests use `tests/helpers/build-test-server.ts` and `app.inject()`, no network.

## Environment

Source: `.env.example` (dev), `.env.prod.example` (prod). All validated in `src/config.ts`.

| Variable                                                                                   | Notes                                                     |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `NODE_ENV`                                                                                 | `development` / `test` / `production`                     |
| `PORT`, `DEBUG_PORT`                                                                       | host ports for Compose only; app always listens on 3000   |
| `LOG_LEVEL`                                                                                | defaults `debug` (dev) / `info` (prod)                    |
| `THEMES_DIR`, `ASSETS_DIR`, `DEFAULT_THEME`                                                | `./themes`, `./assets`, `default`                         |
| `DEFAULT_FORMAT`, `ENABLED_FORMATS`                                                        | default must be in the enabled list                       |
| `MAX_MARKDOWN_BYTES`, `MAX_CONCURRENCY`, `CONVERT_TIMEOUT_MS`, `MAX_NESTING_DEPTH`         | limits                                                    |
| `ALLOW_REMOTE_IMAGES`, `IMAGE_ALLOWLIST`, `ALLOW_LOCAL_IMAGES`                             | image sources, off by default                             |
| `MAX_IMAGE_BYTES`, `MAX_IMAGE_PIXELS`, `MAX_IMAGES_PER_DOCUMENT`, `IMAGE_FETCH_TIMEOUT_MS` | image limits                                              |
| `STRICT`                                                                                   | defaults to `!production`; strict turns warnings into 422 |
| `ALLOW_RAW_HTML`                                                                           | must be `false`, startup fails otherwise                  |
| `ENABLE_PREVIEW`, `ENABLE_THEME_WATCH`, `ENABLE_SWAGGER_UI`                                | preview and watch forbidden in production                 |
| `CORS_ORIGINS`                                                                             | comma separated                                           |
| `TRUST_PROXY`                                                                              | proxy IPs/CIDRs/presets for `X-Forwarded-For`, empty=none |
| `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_CONVERT_MAX`   | per client, on by default in production only (ADR 0010)   |
| `MD2_IMAGE`                                                                                | Compose `prod` image override (rollback)                  |
| `MD2_UPDATE_VISUAL_BASELINES`                                                              | `1` = regenerate visual baselines                         |

External: no runtime service dependency. Docker Hub image `docker.io/lalbaanthony/md2-api`,
production host reached over SSH, Apache2 reverse proxy in front.

## Gotchas

- `apache.conf` is a manually maintained reference, not deployed by CI. It serves
  `md2-api.dev-it.app`: port 80 serves the Certbot ACME webroot and 301-redirects everything else to
  HTTPS; port 443 terminates TLS (Let's Encrypt, TLS 1.2+, HTTP/2) with security headers and proxies
  `/` to `http://127.0.0.1:4345/`. The production `.env.prod` (`ENV_PROD` secret) must therefore set
  `PORT=4345`. Keep both in sync when changing either.
  Required modules: `http2 ssl rewrite proxy proxy_http headers`.
- The process sees the Docker bridge gateway as the socket address of every production request:
  `.env.prod` must set `TRUST_PROXY=loopback,uniquelocal`, or the rate limiter keys every client
  on the same address. Never widen it to `true`.
- The `prod` service publishes on `127.0.0.1:${PORT}` only, so Apache is the single public entry
  point. Keep the loopback bind: Docker's published ports bypass host firewalls such as ufw.
- Compose interpolates every service regardless of profile: `PORT` and `DEBUG_PORT` must be set
  (via `.env` or the shell) even for `docker compose run --rm test` and for `prod`.
- `prod` must be started with `--env-file .env.prod`, otherwise `PORT` is read from `.env`.
- Boolean env vars accept only `true/false/1/0/yes/no/on/off/""`; anything else fails startup.
- Business routes live under `/v1`; there is no alias for unprefixed paths.
- `docs/openapi.json` is committed and checked in CI: regenerate it after any route or schema
  change (`npm run build && npm run openapi:export`).
- `debug-json` is never registered in production.
- Changing fonts or LibreOffice in `Dockerfile.test` invalidates every visual baseline.
- Production container is read-only, non-root, all capabilities dropped: the service must never
  write to disk.
- Pre-commit hook runs the charset check and full ESLint; commit-msg hook runs the charset check on
  the message. Hooks are active only after `npm run prepare`.
- Deploy: every push to `main` runs full CI, pushes `latest` + `sha-<7>` and redeploys over SSH;
  also monthly (2nd, 03:00 UTC). `v*` tags only retag an already deployed `sha-<commit>` image.
  Rollback procedure in `README.md`.
