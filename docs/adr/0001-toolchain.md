# ADR 0001: Toolchain

Status: accepted
Date: 2026-09-21

## Context

The specification requires TypeScript 6.x with `strict`, `noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, `erasableSyntaxOnly` and `isolatedModules`, and pins every dependency to
an exact version. It also asks for the retained major versions of the libraries whose APIs break
most often to be recorded here.

## Decision

TypeScript 6.0.3 is used. At initialisation the npm `latest` tag pointed at 7.0.2, the native
port, while 6.0.3 was the newest release of the 6.x line and the version `typescript-eslint` 8.x
supports. The specification asks for 6.x, so 6.x is what is pinned. No fallback to 5.x was
needed, and no compiler option had to be disabled.

Retained major versions:

| Package             | Version |
| ------------------- | ------- |
| `typescript`        | 6.0.3   |
| `fastify`           | 5.12.5  |
| `zod`               | 4.6.5   |
| `docx`              | 9.7.1   |
| `shiki`             | 4.4.3   |
| `sharp`             | 0.35.4  |
| `vitest`            | 5.0.1   |
| `eslint`            | 10.11.0 |
| `typescript-eslint` | 8.70.0  |

Every dependency is pinned exactly in `package.json`, with no range prefix, and
`package-lock.json` is committed. CI installs with `npm ci` only.

## Consequences

- `erasableSyntaxOnly` forbids `enum` and constructor parameter properties. Literal unions
  replace `enum` throughout.
- Relative imports name the `.ts` file, as the specification writes them. This requires
  `allowImportingTsExtensions` together with `rewriteRelativeImportExtensions`, which rewrites the
  specifier to `.js` on emit. Verified on the built output.
- Moving to TypeScript 7 later is a separate decision. It requires `typescript-eslint` to support
  the native port, and should be recorded as its own ADR.
