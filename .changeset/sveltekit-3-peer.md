---
'convex-svelte': patch
---

### Fixes

- **Installs with SvelteKit 3** - the optional `@sveltejs/kit` peer dependency is now `^2.12.0 || ^3.0.0`. With `^2.12.0`, npm refused to install `convex-svelte` 0.15.0 next to SvelteKit 3 (`ERESOLVE`).
- **No `runed` dependency** - nothing imported it any more, and its peer range (`@sveltejs/kit ^2.21.0`) caused an `ERESOLVE` warning on SvelteKit 3, and an error with `--strict-peer-deps`.
