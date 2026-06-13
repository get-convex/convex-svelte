---
'convex-svelte': minor
---

### Features

- **`closeConvex()`** - new export (from `convex-svelte` and `convex-svelte/sveltekit`) for explicit client teardown, e.g. in tests. After closing, the next `setupConvex()` / `initConvex()` creates a fresh client.

### Fixes

- **HMR and remounts** - `setupConvex()` no longer closes the client when its component unmounts. The client is shared app-wide (context hooks, SSR transport, detached queries), so closing it on component teardown broke remounts and crashed dev-mode HMR with a misleading "ConvexClient is disabled" error. The client is now app-scoped, stays open for the lifetime of the app, and a closed client is never reused.
- **`usePaginatedQuery` with `keepPreviousData`** - existing paginated results stay visible while new query arguments load, preventing transient empty states during search/filter changes.
- **`usePaginatedQuery` with SSR `initialData`** - `loadMore()` calls made before the live subscription is ready are now queued and run once it connects, instead of being silently dropped.

### Improvements

- **Single deployment per app** - `setupConvex()` and `initConvex()` now throw when called with a different URL while a client already exists, instead of silently reusing the old deployment's client.
