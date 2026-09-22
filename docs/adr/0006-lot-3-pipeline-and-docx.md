# ADR 0006: The minimal pipeline and the first DOCX backend

Status: accepted
Date: 2026-09-21

## Context

Lot 3 delivers `parse`, the first normalisation passes, a minimal DOCX backend, `POST /convert`
and the OpenAPI document. Several decisions were forced by what the tools actually do rather
than by the specification, and they are recorded here.

## 1. An unmatched link reference never reaches the normaliser

Section 5.3 puts link resolution in a pass of its own, with a fallback for a reference whose
definition is missing. CommonMark parses `[text][missing]` as literal text when no definition
matches, so remark never produces an orphan `linkReference` node, and the fallback is
unreachable from ordinary input.

The fallback is kept, because a later pass may inject nodes, and it is covered by a unit test
that builds the orphan tree directly rather than by a contract test that cannot produce one.

## 2. `pageBreakBefore` and `widowControl` are carried by the compiled theme

Section 11.5 asks for `keepWithNext`, `pageBreakBefore`, `outlineLevel` and `ruleBelow` to be
carried by the style rather than by the paragraph, so that editing the style in Word changes the
behaviour. `keepWithNext`, `outlineLevel` and `ruleBelow` are expressible in the `docx` style
options. `pageBreakBefore` and `widowControl` are not: the library exposes them on paragraph
instances only, although OOXML allows them in a style.

`DocxCompiledTheme.paragraphBehaviour` therefore carries both values and the renderer applies
them per paragraph. This is a departure from section 11.5 that should be revisited with the raw
XML escape hatch of section 11.14 when it lands.

## 3. The DOCX type declarations import types from the `docx` package

Section 11.1 shows `src/types/docx-theme.ts` declaring a compiled theme over `IStylesOptions`,
`INumberingOptions` and `ISectionPropertiesOptions`, which come from the `docx` package.
Constraint C13 forbids importing that package outside `src/formats/docx/**`. The two are in
direct contradiction.

A type only import erases completely under `verbatimModuleSyntax`, so it creates no runtime
dependency, which is what C13 protects. The local ESLint rule now allows `import type` from a
format package inside `src/types/<format>-*.ts` and nowhere else, and an architecture test
asserts that every `docx` import in those files is type only.

## 4. Golden snapshots need the relationship identifiers normalised

The `docx` library generates a random relationship identifier for every hyperlink, so two
conversions of the same document are not byte identical, which the first golden run caught.
Section 14.2 anticipates this and asks for ordinals substituted through a table kept consistent
within a document.

`tests/helpers/docx-normalise.ts` implements the five normalisation steps: volatile attributes
removed, relationship identifiers replaced by ordinals through a shared table, attributes sorted
by name, two space reindentation, and line endings normalised. The determinism test of C15
compares the normalised form, as section 14.2 specifies.

## 5. What the renderer does with a block it cannot render yet

The renderer is total: every `IrBlock.kind` and every `IrInline.kind` has a case, enforced by
`assertNever`. The kinds that later lots implement emit a `BLOCK_NOT_RENDERED` or
`INLINE_NOT_RENDERED` warning and render nothing, rather than failing. This matches section 7.3:
the backend decides how to degrade and declares it.

These warnings disappear lot by lot. A conversion of a document that uses only the constructions
of Lot 3 emits no warning, which the example test asserts in strict mode.

## 6. The document language has a constant, not an environment variable

`DocumentMeta.language` is required, and neither the front matter nor the request always carries
it. Section 9.1 declares no variable for a fallback, so `DEFAULT_DOCUMENT_LANGUAGE` in
`src/constants.ts` provides it. Adding an environment variable would have been a larger
departure than adding a constant.

## 7. Verification that needs Word and LibreOffice

The end of lot condition asks for a document that opens without a repair prompt in Word and in
LibreOffice. What is verified here is structural: the archive carries the mandatory parts, every
part is well formed XML, the named styles exist and are referenced, and the output is stable.
Opening the file in the two readers needs the Docker test image of Lot 12, and is checked there.

## 8. The conversion request carries the document options

Section 7.1 declares `ConversionRequest` as the document, the theme and the strict flag. Section
10.2 lets a request switch the title page and the table of contents on or off, and both are
rendering decisions that the theme also carries.

The table of contents is representable in the intermediate representation, so `normalize` resolves
it: it inserts a `tableOfContents` block when the effective flag is on and the document carries no
`::toc` directive. The title page has no block in section 5.1, so the backend builds it from the
metadata and the compiled theme, and needs to know the per request override.

`ConversionRequest` therefore gained an optional `options` field carrying the document options. It
is optional, so a backend that ignores it stays correct, and the theme remains the default for both
flags.
