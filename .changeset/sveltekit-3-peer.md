---
'convex-svelte': patch
---

### Fixes

- **Installs with SvelteKit 3** - the optional `@sveltejs/kit` peer dependency is now `^2.12.0 || ^3.0.0`. With `^2.12.0`, npm refused to install `convex-svelte` 0.15.0 next to SvelteKit 3 (`ERESOLVE`).
- **Clear `convexLoadHydration` warning on SvelteKit 3** - SvelteKit 3 no longer marks universal load functions, so the handle can't tell them apart from server loads and embeds nothing (unchanged, fail closed). Its warning used to ask for SvelteKit 2.56 or later; on SvelteKit 3 it now explains the effect and the fix: move `convexLoad()` calls that need auth into `+page.server.ts` / `+layout.server.ts` and remove the handle.
