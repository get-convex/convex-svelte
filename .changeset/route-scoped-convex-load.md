---
'convex-svelte': minor
---

### Fixes

- **`convexLoad` / `convexLoadPaginated` subscriptions are released after leaving a route** ([#57](https://github.com/get-convex/convex-svelte/issues/57)) - previously every query created through `convexLoad`, `convexLoadPaginated`, or the SvelteKit transport stayed subscribed for the life of the tab, so bandwidth and function calls grew with every visited page (including hover preloads and `invalidate()` re-runs). These queries are now route-scoped: they stay subscribed while they are reachable from `page.data` (all layouts plus the current page) or rendered by a component, and are released afterwards. A released query resubscribes automatically when it is used again.

### Features

- **Idle buffer for released queries** - released queries stay subscribed in a small LRU buffer so back navigation and revisits stay instant. Configure it via `initConvex(url, { keepAlive: { maxQueries, maxIdleMs } })` (default `{ maxQueries: 10, maxIdleMs: 60_000 }`), or pass `keepAlive: false` to unsubscribe immediately.
- **Per-query `keepAlive`** - `convexLoad(query, args, { keepAlive: false })` and `convexLoadPaginated(query, args, { initialNumItems, keepAlive: false })` skip the idle buffer for that query.
- **`dispose()`** - results of `convexLoad`, `convexLoadPaginated`, `createDetachedQuery`, and `createDetachedPaginatedQuery` expose `dispose()` to stop the subscription explicitly. `createDetachedQuery` / `createDetachedPaginatedQuery` accept `{ scope: 'route' }` to opt into route-scoped release.
- **`isStale` on `convexLoad` results** - now `true` while a released query shows its last known data.

### Improvements

- Declare `@sveltejs/kit@^2.12.0` as an optional peer dependency (`convex-svelte/sveltekit` uses `$app/state`).
