# ADR 0008, the visual regression chain

Status: accepted, lot 12.

## Context

Section 14.2 compares normalised OOXML. That catches a missing element, not a wrong number: a
body size of 13 points instead of 11 produces a valid document, a valid snapshot diff of two
characters, and a document that looks wrong. Section 14.3 asks for a pixel comparison to close
that gap.

## Decision

The chain is DOCX, then PDF, then PNG, then `pixelmatch`.

- `soffice --headless --convert-to pdf` produces the PDF. LibreOffice is the only layout engine
  available without a licence that reads the whole of the OOXML we emit
- `pdftoppm -png -r 96` rasterises every page. Ninety six dots per inch gives 794 by 1123 pixels
  for A4, small enough to version and large enough to show a wrong leading or a wrong size
- `pixelmatch` compares with a per pixel threshold of 0.1, and a page fails when more than 0.1
  percent of its pixels differ. The tolerance absorbs the antialiasing jitter of a text renderer
  without absorbing a typographic change, which moves whole lines

Baselines live in `tests/visual/baseline/{format}/{theme}/{corpus}-{page}.png` and are versioned.
`npm run test:visual -- --update` rewrites them and deletes the pages a document no longer has.
The flag reaches the test process through `MD2_UPDATE_VISUAL_BASELINES`, set by `vitest.config.ts`
from its own `process.argv`, because a worker does not see the arguments of the runner.

## Consequences

**The tests run in the test image only.** `describe.skipIf(!isInsideTestImage())` skips the matrix
unless `IN_DOCKER` is set. A host has other fonts, another LibreOffice and another freetype, so a
host run would produce a diff on every page. Outside the container the file still runs two
assertions, which check that the matrix is complete and that every corpus it names exists.

**A font change invalidates every baseline.** The test image pins its font packages, as section
15.1 requires. Changing one is a deliberate act that comes with a baseline regeneration.

**A subprocess is spawned.** Constraint C1 forbids an external binary at production runtime. It
does not forbid one in a test, and no production code path reaches `tests/visual/helpers`.
`soffice` and `pdftoppm` exist in the image built from `Dockerfile.test` only.

**Each conversion gets its own LibreOffice profile**, through `-env:UserInstallation`, pointed at
a directory of the temporary workspace. A shared profile carries a lock, which makes two
conversions in the same run race, and carries state, which makes a run depend on its predecessors.

**Review is human.** A regenerated baseline is an image, and an image diff in a review is the
only place where a wrong rendering is visible. Regenerating without reading the diff defeats the
whole of section 14.3.

## Rejected

**Rasterising the DOCX directly.** No library reads OOXML layout. Every candidate reimplements a
fraction of it, which would test the fraction rather than the document.

**Comparing PDF text boxes instead of pixels.** It reintroduces the blind spot: a text box carries
its font size, so the comparison would pass on the sizes it is meant to catch only if it compared
every attribute, which is the OOXML snapshot again, one format later.

**Running the matrix on the host with a bundled font set.** Fonts are not the only variable.
Freetype, its hinting configuration and the LibreOffice version all move the pixels.
