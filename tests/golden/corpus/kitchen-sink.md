---
title: The Kitchen Sink
subtitle: Every construction the service renders
author:
  - Ada Lovelace
  - Grace Hopper
date: 2026-09-22
subject: Conversion coverage
keywords:
  - coverage
  - reference
language: en
---

# Introduction

A paragraph of ordinary prose with _italic_, **bold**, _**bold italic**_, ~~struck~~ text and
`inline code`. An [external link](https://example.com) and an [internal link](#lists).

A second paragraph with a hard break after this line,
and the line that follows it.

## Quotations

> A quoted paragraph.
>
> > A nested quotation.
>
> Back to the first level.

# Lists

- An unordered item
- Another unordered item
  - A nested item
    - A third level
- A final item

1. An ordered step
2. A second step
   1. A nested step
3. A third step

- [x] A completed task
- [ ] An open task

An item carrying several blocks:

- The first paragraph of the item.

  The second paragraph of the same item.

# Code

```typescript
export const greet = (name: string): string => {
  // Return a greeting for the name.
  return `hello, ${name}`;
};
```

```
plain text without a language
    indented line
```

# Tables

| Reference | Description                                              | Owner | Status |
| :-------- | :------------------------------------------------------- | ----: | :----: |
| R-1       | A description that is long enough to need a wider column |   Ada |  Open  |
| R-2       | Short                                                    | Grace |  Done  |

# Figures

::figure{src="diagram.png" alt="A diagram" caption="A raster diagram"}

::figure{src="diagram.svg" alt="A vector diagram" width="60%" caption="A rasterised vector diagram"}

An inline image ![a diagram](diagram.png) inside a sentence.

# Callouts

:::callout{type=info title="For information"}
An informative callout.
:::

:::callout{type=warning}
A warning callout.
:::

:::callout{type=danger}
A dangerous callout.
:::

:::callout{type=success}
A successful callout.
:::

:::callout{type=note}
A note callout.
:::

# Sections

::pagebreak

:::landscape
A paragraph that needs the wider page.
:::

:::columns{count=2}
The first paragraph of the two column section.

The second paragraph of the two column section.
:::

# Notes

A sentence with a first note[^one] and a second note[^two], then the first again[^one].

[^one]: The definition of the first note.

    A second paragraph inside the first note.

[^two]: The definition of the second note.

# Characters

Angle brackets a < b, an ampersand in Smith & Sons, "double quotes" and 'single quotes'.

Latin accents, Greek and CJK: éè αβγ 你好

---

The final paragraph after a thematic break.
