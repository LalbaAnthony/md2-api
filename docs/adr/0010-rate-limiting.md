# ADR 0010, rate limiting per client

Status: accepted.
Date: 2026-09-24

## Context

The specification bounds the work of a single request (size, nesting, images, timeout) and the
work of the whole process (semaphore, bounded queue, `under-pressure`), but nothing bounds the
share one client takes. A single caller looping on `/v1/convert` fills the queue of section 10.6
and every other caller gets `503 OVERLOADED`. Section 12.1 has no row for this vector and section
2.6 lists no package for it, so both the feature and its dependency depart from the specification.

## Decision

### Package

`@fastify/rate-limit`, pinned exactly like every other dependency. It is the maintained Fastify
plugin, keeps its counters in a bounded LRU map in memory, and runs on the `onRequest` hook, so a
refused request is answered before its body is read or parsed.

### Two budgets

The business routes are split into two encapsulated Fastify scopes under `/v1`, each with its own
instance of the plugin and therefore its own counters:

| Scope      | Routes                                                               | Budget per window        |
| ---------- | -------------------------------------------------------------------- | ------------------------ |
| conversion | `POST /v1/convert`, `POST /v1/convert/:theme`                        | `RATE_LIMIT_CONVERT_MAX` |
| catalogue  | `GET /v1/themes`, `/v1/themes/:id`, `/v1/formats`, `/v1/formats/:id` | `RATE_LIMIT_MAX`         |

A conversion costs orders of magnitude more than a catalogue read, and a front end reads the
catalogue on every page load, so one shared counter would either starve the front end or let
conversions through at catalogue rates. Both conversion routes share a counter: a per route
`config.rateLimit` would give each route its own store and double the effective budget.

`/healthz`, `/readyz`, `/openapi.json`, `/docs` and `/preview` are registered outside both scopes
and never limited: the container health check and the CI readiness wait must not be refused.

The window is fixed, `RATE_LIMIT_WINDOW_MS`, shared by both budgets.

### Activation

`RATE_LIMIT_ENABLED` defaults to true in production and false elsewhere, the same environment
dependent default as `STRICT` (ADR 0003, section 2). An explicit value always wins.

### Error

A refused request answers `429` with a new code, `RATE_LIMITED`, in the common error body, with
`details.retryAfterSeconds` and a `Retry-After` header. The response also carries
`RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (IETF draft names), which are also
present on every accepted response of a limited scope.

### Client identity and `TRUST_PROXY`

The key is the client address, IPv6 grouped by `/64`. In production the service sits behind
Apache on the same host and is published on the loopback through Docker, so the socket address
seen by the process is the Docker bridge gateway for every request. Without a trusted proxy, the
limit would be global.

`TRUST_PROXY` is handed to the Fastify `trustProxy` option. It accepts only a comma separated list
of `loopback`, `linklocal`, `uniquelocal`, IP addresses and CIDR ranges; `true` and hop counts are
refused, because both let a caller pick its own address through `X-Forwarded-For`. The address is
read from the right of `X-Forwarded-For`, stopping at the first untrusted hop, so an entry a
client prepends before Apache appends the real address is ignored. The empty default trusts no
proxy and keeps `X-Forwarded-For` ignored, which is the previous behaviour.

## Consequences

- Production must set `TRUST_PROXY=loopback,uniquelocal` in `.env.prod` (the `ENV_PROD` secret),
  otherwise every client shares one budget
- `request.ip`, and therefore the logs, now carry the forwarded client address when a proxy is
  trusted
- Counters live in the process: a restart resets them, and two replicas would each allow the full
  budget. A shared store is out of scope while the service runs as a single container
- The LRU holds 5000 keys per scope; a caller rotating through more addresses than that within a
  window can evict its own counters. That is a distributed attack, which belongs to the edge, not
  to this process
- `RATE_LIMITED` is a second code beyond the table of section 10.3, next to `NESTING_TOO_DEEP`
- Covered by `tests/contract/rate-limit.test.ts`, `tests/unit/config.test.ts` and
  `tests/unit/rate-limit.test.ts`
