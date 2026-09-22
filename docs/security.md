# Security

This is the audit of the attack surface of section 12.1 of the specification, one row at a time.
Every row names where the mitigation lives and the test that holds it in place. The tests are in
`tests/contract/security-surface.test.ts` unless another file is named.

## The surface

| Vector                        | Mitigation                                                                                                         | Held by                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Large markdown                | Fastify `bodyLimit` set to `MAX_MARKDOWN_BYTES`, and the byte length checked again before parsing, answering 413   | `oversized markdown`                                         |
| Pathological nesting          | depth counted during flattening, `NESTING_TOO_DEEP` at 422 beyond `MAX_NESTING_DEPTH`                              | `pathological nesting`, `tests/unit/normalize-lists.test.ts` |
| Raw HTML                      | every `html` node refused, `ALLOW_RAW_HTML` locked to false and refused by `loadConfig` when set                   | `raw HTML`                                                   |
| Server side request forgery   | remote fetching off by default, and section 12.2 in full when on                                                   | `remote images`, `tests/unit/image-fetch.test.ts`            |
| Path traversal                | `path.resolve` then a prefix check under `ASSETS_DIR`, with `ALLOW_LOCAL_IMAGES` false by default                  | `path traversal`, `tests/unit/normalize-images.test.ts`      |
| XML injection                 | every value escaped by the serialiser, no string concatenation into the document                                   | `XML injection`, the golden corpus `special-chars-xml.md`    |
| Header injection by file name | the request schema refuses anything outside `[\w\-. ]`, and the accepted name is sanitised again before the header | `header injection through the file name`                     |
| Decompression bomb            | `MAX_IMAGE_BYTES` and `MAX_IMAGE_PIXELS` enforced on the metadata, before any full decode                          | `image bounds`, `tests/unit/normalize-images.test.ts`        |
| Processor exhaustion          | the semaphore and its bounded queue, `CONVERT_TIMEOUT_MS`, and `under-pressure` in production                      | `processor exhaustion`, `tests/unit/concurrency.test.ts`     |
| Hostile front matter          | known keys only, everything else lands in `custom` as a string truncated to 500 characters                         | `hostile front matter`                                       |
| Hostile theme extension       | each backend validates its own slice, unknown keys refused, invalid built in theme stops the start                 | `tests/unit/theme-registry.test.ts`                          |

## Remote images

Off unless `ALLOW_REMOTE_IMAGES` is true, and then, in order:

1. `https` only.
2. The host is in `IMAGE_ALLOWLIST`, matched exactly or as a domain suffix.
3. DNS is resolved explicitly and every resolved address is checked. Private, loopback, link local
   and cloud metadata ranges are refused. The connection is then pinned to the address that was
   checked, which is what closes the DNS time of check to time of use window.
4. At most two redirects, each one re-checked from step one.
5. `IMAGE_FETCH_TIMEOUT_MS` bounds the request, and the read stops at `MAX_IMAGE_BYTES`.
6. The content type is decided by the byte signature, never by the declared header.

Production refuses to start when remote images are enabled with an empty allowlist.

## What production refuses to start with

- `ALLOW_RAW_HTML` true, in any environment.
- `ENABLE_PREVIEW` or `ENABLE_THEME_WATCH` true.
- `ALLOW_REMOTE_IMAGES` true with an empty `IMAGE_ALLOWLIST`.
- A built in theme that fails validation, or a theme directory holding an invalid file.
- `DEFAULT_THEME` or `DEFAULT_FORMAT` naming something that is not registered.

Booleans are read from an explicit accept list, never coerced. `Boolean("false")` is `true` in
JavaScript, and a switch that guards a network call must not fail open. See
`docs/adr/0003-lot-0-deviations.md`.

## Logging

The fields of section 12.3 are written once per conversion, and the markdown never is, not even
truncated. Pino redaction removes the request body, the `markdown` field, the authorization header
and cookies before anything reaches a transport. `tests/contract/logging.test.ts` sends a document
carrying a distinctive word and asserts that no line of the capture contains it.

`X-Request-Id` is reused from the caller when it matches `REQUEST_ID_PATTERN`, and replaced
otherwise, so a caller cannot write arbitrary content into a log line or a response header.

## Responses

A 500 carries a code, a generic message and the request identifier in production. The stack and
the cause are added outside production only. Every response carries `X-Request-Id`.

## The container

Production runs read only, with `cap_drop: ALL`, `no-new-privileges`, a tmpfs on `/tmp` and no
shell tooling: the image holds the compiled output and its runtime dependencies. The service never
writes to disk, so a read only filesystem is a property to keep rather than a constraint to work
around. No subprocess is spawned at runtime, which is constraint C1; the only place the project
spawns one is the visual regression suite, which runs in the separate test image.
