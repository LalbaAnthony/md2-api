# OOXML notes

What the DOCX backend had to learn about WordprocessingML. Everything here is enforced somewhere
in `src/formats/docx/**`, and most of it cost a repair prompt, a wrong rendering or a golden diff
before it was written down.

## Units

| Unit       | Is              | Used for                                 |
| ---------- | --------------- | ---------------------------------------- |
| half point | 1/2 point       | `w:sz`, every font size                  |
| twentieth  | 1/20 point      | `w:ind`, `w:spacing`, page size, margins |
| eighth     | 1/8 point       | border widths                            |
| EMU        | 1/914400 inch   | image extents in the drawing             |
| hundredth  | 1/100 of a line | `w:spacing w:line` in `auto` mode        |

A bare number in any of these is a bug waiting to be shipped, which is why the project carries
branded types for all of them. See `docs/units.md`.

## Styles rather than direct formatting

Every paragraph and every run references a named style. The reader can restyle the whole document
by editing one style, which is the point of producing a Word file rather than a PDF. Direct
formatting is used only where a style cannot carry the property.

Two properties are not available on a paragraph style in the `docx` library and are therefore
applied per paragraph, from `DocxCompiledTheme.paragraphBehaviour`: `pageBreakBefore` and
`widowControl`. See `docs/adr/0006-lot-3-pipeline-and-docx.md`.

## Numbering

A numbering definition carries exactly nine levels. Word silently truncates deeper nesting, so the
backend clamps at nine and emits a warning rather than letting the document lie about its own
structure.

Each root list gets its own numbering instance. Sharing one instance across two lists continues
the count of the first one in the second, which is what makes a second ordered list start at four.
`tests/golden/corpus/consecutive-lists.md` exists for exactly that.

## Sections

A section carries the page size, the margins, the columns, the orientation and the references to
its header and footer parts. A landscape section or a two column section is a new section, which
means a section break, which means the properties of the previous section are closed first.

The last section properties of the document live in the body. Every earlier one lives in the
paragraph properties of the last paragraph of its section. Getting that backwards produces a
document Word offers to repair.

`w:vAlign` centres a section vertically. Word applies it. LibreOffice drops it on import, which is
visible in the visual baselines of the corporate title page.

## Headers and footers

Three slots laid out with tab stops: a centre stop at half the content width and a right stop at
the content width. The separators must be real `<w:tab/>` runs. An empty run between the slots
produces valid XML, passes an OOXML snapshot and renders the three slots glued together, which is
what the visual matrix caught in Lot 12.

`w:titlePg` makes a section use its `first` header and footer. Declaring it without supplying a
first part removes the header from that page, which is the usual intent of a distinct first page.
`w:evenAndOddHeaders` is a document setting, not a section one, and the even parts carry the
mirrored slot order.

## Fields

`TOC`, `PAGE`, `NUMPAGES` and `STYLEREF` are fields, not text. They carry an instruction and a
cached result, and the backend writes no cached result. Word refreshes them on opening because the
document sets `updateFields`. LibreOffice does not, and shows the instruction of the field until
the reader presses F9, which is what the visual baseline of a corporate table of contents shows.

## Tables

The layout is fixed and the column widths sum exactly to the usable width. A rounding error of one
twentieth of a point spread over six columns is enough for Word to redistribute everything, and
the redistribution is not the one the theme asked for. `normalize/tables.ts` is tested on fifty
generated cases for that sum.

A header row is repeated across pages with `tblHeader`. A cell holds block content, so a cell that
holds a paragraph and a list is two block children, not one paragraph with a line break.

## Images

An inline image is a drawing with an extent in EMU. Vector images are rasterised during
normalisation, at twice the target size and at most 300 dots per inch, so the document carries no
SVG at all. That removes a class of Word rendering differences and lets a future HTML backend keep
the vector by declaring a `vectorImages` capability and a second asset variant.

## Footnotes

Footnotes are numbered in order of first reference, not in order of definition, and the note parts
are written in that order. A note holds blocks, so a note with two paragraphs is two paragraphs,
and an empty note still needs one paragraph or the part is invalid.

## Mathematics

OMML is the native form and the backend does not produce it. The chain stops at MathML and the
DOCX backend writes the LaTeX source in the monospace style, declares `math: "source"` in its
capabilities and warns on every conversion that carries mathematics. The reasoning, and what was
rejected, is in `docs/adr/0007-mathematics-chain.md`.

## Escaping

Every value goes through the serialiser of the `docx` library. Nothing is concatenated into the
XML. A paragraph whose text looks like markup, such as a closing run tag, is text in the output,
and `tests/golden/corpus/special-chars-xml.md` keeps it that way.
