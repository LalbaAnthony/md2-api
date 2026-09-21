# ADR 0005: Format registration and the scope of Lot 2

Status: accepted
Date: 2026-09-21

## Context

Lot 2 delivers the format abstraction: the backend contract, the registry, content negotiation,
the `debug-json` backend and the `/formats` routes. Its stated end of lot condition is that
`POST /convert` with `format: "debug-json"` returns the serialised intermediate representation in
development and 404 in production.

That condition cannot be met inside Lot 2. `POST /convert` needs a `DocumentIr`, which needs
`parse` and `normalize`, and section 19 assigns both of those, and the route itself, to Lot 3.

## Decision

Lot 2 delivers every artefact it names and every behaviour that does not need the pipeline.
The half of the end of lot condition that is testable now is tested now: `debug-json` is absent
from `GET /formats` in production, `GET /formats/debug-json` answers 404 there, and the registry
refuses to start when `ENABLED_FORMATS` names it in production. The `POST /convert` half is
verified in Lot 3, when the route exists.

## Registration rules

1. In production, a backend whose `productionReady` is false is never registered, whatever
   `ENABLED_FORMATS` says.
2. In production, naming a backend that is not production ready in `ENABLED_FORMATS` refuses the
   start. This is the acceptance criterion deferred from `loadConfig` in
   `docs/adr/0003-lot-0-deviations.md`, item 3, now implemented where the backend table exists.
3. Outside production, `debug-json` is always registered, whether or not `ENABLED_FORMATS` names
   it, which matches the environment table of section 9.2.
4. An entry of `ENABLED_FORMATS` that no backend implements produces a warning and is ignored.

Rule 4 is deliberately permissive for now. Until the DOCX backend lands in Lot 3, the default
`ENABLED_FORMATS=docx` names a backend that does not exist, so making it fatal would stop the
service from starting on its own defaults and would turn the `docker-build` job of the CI red.
When Lot 3 registers the DOCX backend, rule 4 becomes a startup failure in production, and the
test `exposes no backend in production while the docx backend does not exist` is replaced.

## The debug-json output

The backend serialises the intermediate representation with sorted object keys, anchors sorted by
slug and footnotes sorted by identifier, so that two conversions of the same document are byte
identical, as C15 requires.

Image bytes are replaced by their length and their SHA-256 digest. A faithful base64 dump would
make the output enormous and would add nothing: a digest is stable, small, and still detects any
change to the pixels. The substitution is declared in the caveats of the descriptor.
