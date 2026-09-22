# Adding an output format

The point of the intermediate representation is that a new format costs one directory and three
lines of registration. Parsing, normalisation, theming, image security and the whole test corpus
are reused untouched.

## The six steps

### 1. Declare the identifier

Add it to `OutputFormatId` in `src/types/format.ts`. This is one of the three registration points.

### 2. Declare the types

Create `src/types/<id>-theme.ts` for the compiled theme and `src/types/<id>-render.ts` for the
renderer context. Constraint C7 puts every type under `src/types/`, and the local ESLint rule lets
these two files, and only these, import types from the format specific package, as long as the
import is `import type`.

### 3. Declare the capabilities

Create `src/formats/<id>/capabilities.ts` with the media type, the file extension and a
`FormatCapabilities` value. Declare only what the backend really does. A capability that is true
and not implemented is worse than one that is false.

### 4. Write the backend

Create `src/formats/<id>/backend.ts` implementing `FormatBackend`:

```ts
export const myBackend: FormatBackend = {
  descriptor,
  themeExtensionJsonSchema,
  validateThemeExtension,
  describeThemeCaveats,
  warmUp,
  convert,
  invalidateThemeCache,
};
```

`convert` receives the document, the theme and the strict flag, and returns bytes, a media type, a
file extension, warnings and timings. The usual shape is three stages: compile the theme, render
synchronously, serialise. Keep `render` free of `await` and of any input or output. An architecture
test enforces that for every file under `src/formats/*/render/**`, and if a renderer needs to wait
for something then `normalize` forgot to do it.

### 5. Register it

Add the backend to the table in `src/formats/registry.ts`. That is the second registration point.

### 6. Add it to the tests

Nothing to write: the golden matrix is built from the registry, so the whole corpus runs against
the new backend as soon as it is registered. Run `npm run test:golden -- --update`, review the new
snapshots, and commit them. That is the third registration point, and it is a review rather than
a code change.

## What you must not do

- Import your format package anywhere outside `src/formats/<id>/**`, except as a type in
  `src/types/<id>-*.ts`. A local ESLint rule and an architecture test both check this.
- Read the raw `Theme` from a renderer. A renderer sees the compiled form only, which is what lets
  the compiled form be cached per theme and per content hash.
- Add a format specific field to the core of the theme. If two formats need it, it belongs in the
  core; if one does, it belongs in that format's extension under `theme.formats.<id>`.
- Degrade silently. If you cannot render something, declare the capability as absent, emit a
  `ConversionWarning`, and let strict mode turn it into a 422.

## Checklist

- [ ] `OutputFormatId` carries the new identifier
- [ ] `src/types/<id>-theme.ts` and `src/types/<id>-render.ts` exist
- [ ] capabilities declare only what is implemented
- [ ] `validateThemeExtension` refuses unknown keys
- [ ] `describeThemeCaveats` reports the limits of each theme
- [ ] the backend is in the registry table
- [ ] the golden corpus passes, with reviewed snapshots
- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass
