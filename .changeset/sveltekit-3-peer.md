---
'convex-svelte': patch
---

### Fixes

- **Installs with SvelteKit 3** - the optional `@sveltejs/kit` peer dependency is now `^2.12.0 || ^3.0.0`. With `^2.12.0`, npm refused to install `convex-svelte` 0.15.0 next to SvelteKit 3 (`ERESOLVE`).
