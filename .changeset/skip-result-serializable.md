---
'convex-svelte': patch
---

### Fixes

- **Skipped queries in server loads** - `convexLoad(query, 'skip')` in a `+page.server.ts` / `+layout.server.ts` load failed with `Cannot stringify a function` since 0.15.0, because the skipped result has a `dispose()` function that SvelteKit can't serialize. `convexLoadPaginated(query, 'skip', ...)` failed the same way because of its `loadMore()`. The transport hooks now send skipped results to the browser and recreate them there, with the same shape as before.
