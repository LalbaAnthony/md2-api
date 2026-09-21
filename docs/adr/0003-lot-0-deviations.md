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

Both corpora arrive in later lots. Until then the two scripts pass `--passWithNoTests` so that
`ci.flow.yml` is runnable end to end from Lot 0. The flag is removed when each suite lands.

## 5. `contract.inc.yml` does not yet compare `docs/openapi.json`

The OpenAPI document and `tools/export-openapi.mjs` arrive in Lot 3. The comparison step is added
to the workflow at that point.

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

The `deps` stage of `docker/Dockerfile` therefore copies that one file before `npm ci`, which is
the only departure from the Dockerfile given in section 15.1. The alternative, `npm ci
--ignore-scripts`, would also skip the install scripts of native dependencies.
