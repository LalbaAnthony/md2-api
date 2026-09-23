# ADR 0009, versioning in the URL

Status: accepted.

## Context

The contract of `/convert`, `/themes` and `/formats` was published without a version. Any breaking
change to a request or response shape would have had to break every caller at once.

## Decision

The business routes are registered under the prefix `/v1`, held by `API_VERSION_PREFIX` in
`src/constants.ts` and applied through the Fastify `prefix` option in `src/server.ts`. The route
plugins declare their paths without the prefix, so a `/v2` can mount a second set of plugins
beside the first.

The following stay at the root:

- `/healthz` and `/readyz`, because the container health check and the CI readiness wait address
  the process, not a contract version
- `/openapi.json` and `/docs`, because the document describes every mounted version
- `/preview`, a development page that calls `/v1/convert`

## Consequences

- The unprefixed business paths answer 404. There is no redirect and no alias: a caller of the
  unversioned paths must move to `/v1`
- `docs/openapi.json` lists the business paths with their `/v1` prefix
- `tests/contract/versioning.test.ts` proves both the prefix and the routes that stay outside it
