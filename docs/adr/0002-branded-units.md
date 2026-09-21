# ADR 0002: Branded units and the assertion boundary

Status: accepted
Date: 2026-09-21

## Context

Constraint C4 forbids type assertions. Constraint C11 forbids passing a layout length as a bare
`number`. These two constraints are in direct tension: a branded type is a nominal type built
from a structural one, and TypeScript offers no way to produce one without an assertion.

## Decision

Branded units are declared in `src/types/units.ts` over the `Brand` helper of
`src/types/brand.ts`, which uses a `declare const ... : unique symbol` tag. Every assertion that
creates a branded value lives in `src/units.ts` and nowhere else. No other file produces a
branded value except by calling a constructor of `src/units.ts`.

`eslint.config.js` turns `@typescript-eslint/consistent-type-assertions` off for `src/units.ts`
alone. `tests/unit/architecture.test.ts` independently asserts that no other source file contains
an assertion, so disabling the rule elsewhere would still fail the suite.

The second sanctioned boundary of the specification, raw JSON validation, is declared in
`eslint.config.js` for `src/config.ts`, `src/theme/registry.ts` and
`src/formats/docx/theme-extension.ts`. As of this lot, `src/config.ts` needs no assertion at all:
`zod` returns a precise type from `safeParse`. The allowance stays declared because the theme
registry and the theme extension validator will need it when third party types prove insufficient
at the entry point.

## Consequences

- A wrong unit factor is a compile error rather than a silently wrong document.
- The cost of the system is one file of constructors and one truth table test, both small.
- Arithmetic helpers are needed per unit, because `Dxa + Dxa` produces `number`. Only the
  operations the project actually uses are provided.
