# ADR 0007: The mathematics chain

Status: accepted
Date: 2026-09-22

## Context

Section 11.13 calls the mathematics chain the most fragile point of the project. It asks for
LaTeX to become MathML during normalisation, for the DOCX backend to translate that MathML to
OMML and inject it through the raw XML escape hatch, and for a documented fallback when the
translation fails. It also says, in as many words, that if the budget of the first version does
not allow OMML, the fallback is shipped, the capability is declared as `source`, and the rest of
the project is not blocked on it.

## Decision

The chain is split in two, and only the first half is implemented.

**LaTeX to MathML, in `normalize`.** KaTeX renders each `math` and `inlineMath` node with
`output: "mathml"`, and the `<math>` element is extracted from the result. Display and inline
formulas are distinguished by `displayMode`, which is what puts `display="block"` on the element.
A formula KaTeX refuses produces `mathml: null` and a `MATH_NOT_CONVERTED` warning, never an
error. The intermediate representation therefore carries both the LaTeX source and, when it could
be produced, the MathML, which is exactly what section 5.2 requires: the representation is neutral
and a future HTML backend consumes the MathML directly with no further work.

**MathML to OMML, in the DOCX backend: not implemented.** The backend renders the LaTeX source in
the `MathInline` character style, emits a `MATH_RENDERED_AS_SOURCE` warning, declares
`math: "source"` in its capabilities and states the fallback in its caveats, which
`GET /formats/docx` reports.

## Why OMML is deferred

There is no maintained TypeScript library that converts MathML to OMML. The two realistic routes
are both large:

1. Port the `MML2OMML.XSL` stylesheet that ships with Word. It is several thousand lines of XSLT
   and would need an XSLT engine at runtime, which constraint C1 makes awkward, or a hand
   translation of the whole stylesheet.
2. Write a converter for a subset of MathML by hand. A subset is the problem: a formula outside
   the subset produces a document that Word opens with a repair prompt, which is a worse failure
   than rendering the source, and the boundary of the subset is invisible to the author.

Both are a lot of work with a high risk of producing quietly wrong documents, against a fallback
that is honest, declared, and readable.

## Consequences

- A reader sees `E = mc^2` rather than a typeset formula. The information is present and correct,
  the presentation is not.
- The capability is `source`, so a caller that needs typeset mathematics knows from
  `GET /formats/docx` that this format will not give it.
- Nothing else in the project depends on this decision. The MathML sits in the intermediate
  representation, so implementing OMML later means writing one renderer and changing one capability
  value, with no change to parsing, normalisation, themes or any other backend.
- A future HTML backend gets typeset mathematics for free from the MathML already produced.

## Alternatives considered

- **Rasterising formulas to images.** It would look right, but it makes the formula unselectable
  and unsearchable, ties the result to the fonts of the server, and adds an image per formula to a
  document that declares `vectorImages: false`.
- **Shipping no mathematics at all.** The source is more useful than nothing and costs a run.
