# ADR 0003: Deviations recorded during Lot 0

Status: accepted
Date: 2026-09-21

The specification has binding status, so every departure from its letter is recorded here.

## 1. Boolean environment variables are not parsed with `z.coerce.boolean()`

The specification writes `z.coerce.boolean()` for `ALLOW_REMOTE_IMAGES`, `STRICT`,
`ENABLE_PREVIEW` and the other switches. Coercion applies `Boolean(value)` to a string, and
`Boolean("false")` is `true`. Every one of these variables is a security or exposure switch, so
following the letter of the schema would make `ALLOW_REMOTE_IMAGES=false` enable remote fetching.

`src/config.ts` parses these variables through an explicit accept list: `true`, `1`, `yes`, `on`
are true, `false`, `0`, `no`, `off` and the empty string are false, anything else is a validation
failure. The behaviour is covered by `tests/unit/config.test.ts`.

`ALLOW_RAW_HTML` is parsed the same way and then rejected if true, which keeps the switch locked
off while still producing a readable error rather than a silent default.

## 2. Environment dependent defaults

Section 9.1 gives fixed defaults, section 9.2 gives different values for development and
production for `STRICT`, `LOG_LEVEL` and Swagger UI. The schema keeps these three optional, and
`loadConfig` applies the environment dependent default when the variable is absent. An explicit
value always wins.

## 3. The production readiness check on `ENABLED_FORMATS` is not in `loadConfig`

Section 9.1 asks `loadConfig` to refuse to start when `ENABLED_FORMATS` names a backend that is
not production ready. That test requires the backend table, and making `src/config.ts` import the
format registry would invert the dependency between configuration and the format layer.

`loadConfig` performs the checks that need no backend: the list is not empty, and `DEFAULT_FORMAT`
belongs to it. The production readiness check belongs to the registry construction in Lot 2, and
still refuses to start. The acceptance criterion is unchanged, only its location is.

## 4. `test:golden` and `test:visual` tolerate an empty suite

The golden suite landed in Lot 3, so `test:golden` no longer needs the flag and it is removed.
Resolved in Lot 12: the visual matrix and its baselines exist, so `test:visual` no longer carries
`--passWithNoTests` either. Outside the test image the matrix is skipped and the file still asserts
that the matrix is complete and that every corpus it names exists, so the script has work to do on
a host as well.

## 5. `contract.inc.yml` does not yet compare `docs/openapi.json`

Resolved in Lot 3. `tools/export-openapi.mjs` writes `docs/openapi.json`, the same script run
with `--check` fails when the committed file differs from the served document, and
`contract.inc.yml` runs it.

## 6. Additional modules and packages

`src/lib/readiness.ts` is not named in the tree of section 3. `/readyz` has to answer on the
state of theme loading and backend warm up, and that state is owned neither by the server nor by
a route. It is a four line module that later lots write into.

### Packages

`@fastify/cors` and `globals` are not listed in section 2.6 or 2.7. The first implements the CORS
policy required by section 9.2, the second supplies the environment globals to the flat ESLint
configuration. `@eslint/js` is likewise required by the flat configuration.

## 7. The `prepare` script and the Dockerfile `deps` stage

Git hook installation runs from the `prepare` lifecycle script, so a fresh clone gets the hooks
from a plain `npm ci`. That script also runs during the image build, where git is absent, so
installation is delegated to `tools/install-git-hooks.mjs`, which exits successfully when there
is no git working tree or no git binary.

The `deps` stage of `Dockerfile` therefore copies that one file before `npm ci`, which is
the only departure from the Dockerfile given in section 15.1. The alternative, `npm ci
--ignore-scripts`, would also skip the install scripts of native dependencies.

## 8. One error code beyond the table of section 10.3

Added in Lot 13. Sections 12.1 and 16.1 both require a document that nests blocks beyond
`MAX_NESTING_DEPTH` to answer 422, and the table of section 10.3 carries no code whose meaning
covers that refusal: the document is well formed, no capability is missing and no directive is
wrong. It was answering `VALIDATION_ERROR`, which is 400, so the bound was documented one way and
enforced another.

`NESTING_TOO_DEEP`, mapped to 422, closes that gap. It is the only code outside the published
table, it is covered by the exhaustive mapping test of `tests/unit/errors.test.ts`, and the table
of `docs/security.md` names it next to the bound it enforces. The alternative, reusing
`UNSUPPORTED_FEATURE`, would tell a caller that the output format lacks a capability, which is
false and would send them looking in the wrong place.

## 9. `Dockerfile` and `docker-compose.yml` live at the repository root

The tree of section 3 puts both under `docker/`. They are at the root instead, at the request of
the project owner.

The root is where every tool looks for them first: `docker compose` with no `-f`, `docker build`
with no `--file`, Docker Desktop, and the build integration of most editors and hosting providers.
A build context of `.` also stops the Dockerfile referring to its own parent, which is what the
`context: ..` of the previous layout required.

Nothing else moves. `.dockerignore` was already at the root, where Docker requires it, and the
context is the same directory it was before, so the ignore list and every `COPY` path are
unchanged. `npm run test:all` is now plain `docker compose run --rm test`.
