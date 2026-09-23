# Theming

A theme decides everything the reader sees. It carries no format specific knowledge: the same
theme drives every output format, and each backend compiles it into its own configuration. You can
write a complete theme without reading a single line of backend code.

## Where a theme lives

A theme is a JSON file in `THEMES_DIR`, named after the identifier it declares. `report.json` must
declare `"id": "report"`, otherwise it is refused. The four built in themes, `default`,
`corporate`, `academic` and `technical`, are compiled into the image and always available.

A theme from the directory that reuses the identifier of a built in theme replaces it, with a
warning. In development, `ENABLE_THEME_WATCH` reloads the directory on every change. In production
the directory is read once at start, and a theme that fails validation stops the service from
starting rather than being quietly skipped.

## The shape

Validation is strict everywhere. An unknown key is an error, not something ignored, so a typo is
reported rather than silently dropping the value you meant to set.

| Section           | What it decides                                                     |
| ----------------- | ------------------------------------------------------------------- |
| `page`            | paper size, orientation, margins, gutter, columns                   |
| `type`            | body, heading and monospace families, base size, scale, leading     |
| `color`           | text, accents, links, rules, code, quotes, tables, callout variants |
| `heading`         | exactly six entries, one per level                                  |
| `paragraph`       | alignment, spacing, line height, first line indent, widow control   |
| `quote`           | indents, bar, italic, size, spacing                                 |
| `code`            | size, line height, padding, line numbers, language label, tab width |
| `list`            | bullet glyphs, ordered formats, suffix, indents, task glyphs        |
| `table`           | header, padding, borders, stripes, size, minimum column width       |
| `figure`          | alignment, maximum width ratio, spacing, border                     |
| `caption`         | position, prefixes, separator, size, colour, alignment              |
| `callout`         | padding, bar width, labels, tinted background                       |
| `footnote`        | size, separator width, number format                                |
| `tableOfContents` | whether to insert one, its title, depth, leader, page break         |
| `chrome`          | header, footer and title page                                       |
| `syntax`          | one colour per semantic scope                                       |
| `formats`         | per format extensions, validated by the backend that owns each key  |

## Units

Lengths are plain numbers in the file, and the schema decides what unit each one is in.

- Page sizes, margins, indents, padding and column widths are twips, 1/1440 inch. A4 is 11906 by
  16838, a 25.4 mm margin is 1440.
- Font sizes, spacing before and after, and letter spacing are points.
- Border widths are eighths of a point. A one point rule is 8, a half point rule is 4.

Colours are six hexadecimal digits with no leading hash: `1A1A1A`, not `#1A1A1A`.

`docs/units.md` documents every unit and every conversion.

## What the schema refuses

- an unknown key, anywhere
- a colour with a hash, or of the wrong length
- fewer than six heading entries, or more
- a header or footer with anything other than three slots
- fewer than three bullet glyphs
- a figure ratio outside the interval from zero, exclusive, to one
- a non integer twip
- an emoji anywhere, and an en dash or em dash in any text

## Chrome

A header or footer has exactly three slots, laid out left, centre and right with tab stops. Each
slot is one of:

| Slot         | Renders                                                         |
| ------------ | --------------------------------------------------------------- |
| `text`       | the literal value you give it                                   |
| `meta`       | the title, the authors, the date or the subject of the document |
| `pageNumber` | the current page                                                |
| `pageCount`  | the total number of pages                                       |
| `chapter`    | the most recent level one heading on the page                   |
| `empty`      | nothing                                                         |

`differentFirstPage` suppresses that header or footer on the first page of the document, which is
what a report wants when page one carries a title. The other of the pair keeps its content on that
page: asking for a distinct first page in the header does not silently remove the footer.

`differentOddEven` mirrors the three slots on even pages, so a slot on the outer edge of a recto
page stays on the outer edge of a verso page. It is the setting to use for a document printed
double sided and bound.

The title page is built from the document metadata. When `pageBreakAfter` is true it becomes its
own section, so the body starts on a fresh page. `verticalAlign` centres that section vertically.
Word applies it, LibreOffice ignores it on import and lays the page out from the top.

## Syntax colours

`syntax` maps each semantic scope to a colour. The scopes are `keyword`, `string`, `number`,
`comment`, `function`, `type`, `variable`, `operator`, `punctuation`, `constant`, `tag`,
`attribute` and `plain`. Tokenisation happens once during normalisation and produces scopes, never
colours, so the same tokenisation serves every theme.

## Format extensions

`formats` holds one object per output format. Each backend validates its own entry strictly, and
publishes its JSON Schema at `GET /formats/:id`, so you can see exactly which keys it accepts.

```json
{
  "formats": {
    "docx": { "styleIdPrefix": "Acme", "updateFieldsOnOpen": true }
  }
}
```

Nothing in the core of a theme is format specific. If a setting matters to two formats it belongs
in the core; if it matters to one, it belongs in that format's extension.

## The example theme

`themes/example.json` ships in the theme directory as a starting point. It is a complete theme with
every section filled and every optional feature switched on at once: a title page, a running header
and footer using all six slot kinds, a table of contents, numbered headings with a rule under the
first two levels, an uppercase level one and a small capitals level two, justified paragraphs with a
first line indent, a tinted quote background, numbered code lines with a language label, striped
tables, a border around figures, a bordered code block, and one ordered format per list level.

It is a catalogue rather than a recommendation: a real theme picks a few of these. Read it next to
this page to see what a key does, copy it, and switch off what you do not want.
`tests/unit/example-theme.test.ts` holds it to the same bar as the built in themes, which is that it
renders the whole of `tests/golden/corpus/kitchen-sink.md` in strict mode without a warning.

## Writing one

Start from a built in theme, change what you need, and check the result:

```
cp themes/example.json themes/report.json
curl http://127.0.0.1:3000/themes/report
```

`GET /themes/:id` returns the validated theme, the derived content box, and the caveats each active
format declares for it, which is where you learn that, for instance, the DOCX backend leaves the
table of contents to be refreshed by the reader.

With `ENABLE_PREVIEW=true`, `GET /preview` gives an editor with a theme and format selector. It is
the fastest way to iterate on a theme.
