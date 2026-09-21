# ADR 0004: Keeping the theme schema an exact mirror of the theme interface

Status: accepted
Date: 2026-09-21

## Context

Section 6.3 requires `themeSchema` to be a strict mirror of the `Theme` interface, and a test to
prove the equivalence with `expectTypeOf`. Constraint C7 makes the interface the source of truth,
so the schema has to follow it exactly, including two properties that a plain Zod schema does not
reproduce:

1. `Theme` is deeply `readonly`. A Zod object infers mutable properties.
2. Every length in a theme is a branded unit, `Pt`, `Dxa` or `Eighth`, not a bare `number` (C11).
   A theme file on disk carries plain numbers.

A first attempt used `z.number().transform(pt)` for the units. That satisfies the type equality,
but `fastify-type-provider-zod` serialises a response by encoding it through the same schema, and
a one way transform cannot encode. `GET /themes/:id` answered 500 with
`Encountered unidirectional transform during encode`.

## Decision

Every object, array and tuple in `src/theme/schema.ts` carries `.readonly()`, which makes the
inferred type deeply readonly and freezes the parsed theme at runtime.

Every unit field is a `z.codec`, not a transform:

```ts
const twipCodec = (input: z.ZodNumber) =>
  z.codec(input, z.custom<Dxa>(), {
    decode: (value) => dxa(value),
    encode: (value) => value,
  });
```

Decoding goes through the constructor of `src/units.ts`, which keeps the rule of ADR 0002 intact:
branding still happens in exactly one module. Encoding is the identity, because a branded unit is
a number at runtime, so a theme can be serialised back through the same schema.

`tests/unit/theme-schema.test.ts` asserts the equality in both directions, and the route contract
test asserts that `GET /themes/:id` returns the theme with its numbers intact.

## Consequences

- The schema is verbose. That verbosity is the price of a mechanically proven mirror, and the
  test catches any field that drifts.
- A response schema can reuse `themeSchema` directly, so the API exposes exactly the validated
  shape and the OpenAPI document describes a theme without a second declaration.
- Any future unit added to a theme must be declared as a codec, never as a transform. A plain
  transform would pass the type test and fail only at serialisation time.
