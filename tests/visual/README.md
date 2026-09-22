# Visual regression

These tests run inside the Docker test image only. They are skipped when `IN_DOCKER` is unset,
because the pixels depend on the LibreOffice version, on freetype and on the installed fonts.

```
docker compose run --rm test npm run test:visual
```

Regenerate the baselines after a deliberate change of rendering:

```
docker compose run --rm test npm run test:visual -- --update
```

A regeneration rewrites `baseline/{format}/{theme}/{corpus}-{page}.png` and removes the pages a
document no longer has. Review every changed image before merging: a baseline accepted without
being looked at records the regression instead of catching it.

A failing page writes its diff to `tests/visual/diff/`, which is not versioned.
