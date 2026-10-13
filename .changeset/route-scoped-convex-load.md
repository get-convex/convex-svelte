---
'convex-svelte': minor
---

### Breaking

- **`convex-svelte/sveltekit` requires SvelteKit 2.12 or later**, because it now imports `$app/state`. It can no longer be imported outside a SvelteKit app, e.g. to use `createConvexHttpClient` in a Node script; use `ConvexHttpClient` from `convex/browser` there. `@sveltejs/kit@^2.12.0` is declared as an optional peer dependency.

### Fixes

- **`convexLoad` / `convexLoadPaginated` subscriptions are released after leaving a route** ([#57](https://github.com/get-convex/convex-svelte/issues/57)) - previously every query created through `convexLoad`, `convexLoadPaginated`, or the SvelteKit transport stayed subscribed for the life of the tab, so bandwidth and function calls grew with every visited page (including hover preloads and `invalidate()` re-runs). These queries are now route-scoped: they stay subscribed while they are reachable from `page.data` (all layouts plus the current page) or rendered by a component, and are released afterwards. A released query resubscribes automatically when it is used again.
- **Unclaimed queries are closed after 5 s** - a query that no route ever uses (a hover preload the user doesn't click, a superseded navigation) is closed after 5 s and never takes a slot in the idle buffer, so hovering over many links can't push out pages you visited. A late click resubscribes.

### Features

- **Idle buffer for released queries** - released queries stay subscribed in a small buffer, so revisiting a page reuses the live subscription instead of subscribing again. A revisit replaces its idle copy instead of taking another slot. Configure it via `initConvex(url, { queryCache: { maxIdleEntries, expiration } })` (default `{ maxIdleEntries: 10, expiration: 60_000 }`), or pass `queryCache: false` to unsubscribe immediately. The option names match convex-helpers' `ConvexQueryCacheProvider`; when the buffer is full, the query idle the longest is evicted. `closeConvex()` disposes all of these queries.
- **Per-query `keepAlive`** - `convexLoad(query, args, { keepAlive: false })` and `convexLoadPaginated(query, args, { initialNumItems, keepAlive: false })` skip the idle buffer for that query.
- **`dispose()`** - results of `convexLoad`, `convexLoadPaginated`, `createDetachedQuery`, and `createDetachedPaginatedQuery` expose `dispose()` to stop the subscription explicitly. After `dispose()`, `loadMore()` returns `false`. `createDetachedQuery` / `createDetachedPaginatedQuery` accept `{ scope: 'route' }` to opt into route-scoped release.
- **`isStale` on `convexLoad` results** - now `true` while a released query shows its last known data.
