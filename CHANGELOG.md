# convex-svelte

## 0.14.0

### Minor Changes

- 97e072f: ### Features

  - **`closeConvex()`** - new export (from `convex-svelte` and `convex-svelte/sveltekit`) for explicit client teardown, e.g. in tests. After closing, the next `setupConvex()` / `initConvex()` creates a fresh client.

  ### Fixes
  - **HMR and remounts** - `setupConvex()` no longer closes the client when its component unmounts. The client is shared app-wide (context hooks, SSR transport, detached queries), so closing it on component teardown broke remounts and crashed dev-mode HMR with a misleading "ConvexClient is disabled" error. The client is now app-scoped, stays open for the lifetime of the app, and a closed client is never reused.
  - **`usePaginatedQuery` with `keepPreviousData`** - existing paginated results stay visible while new query arguments load, preventing transient empty states during search/filter changes.
  - **`usePaginatedQuery` with SSR `initialData`** - `loadMore()` calls made before the live subscription is ready are now queued and run once it connects, instead of being silently dropped.

  ### Improvements
  - **Single deployment per app** - `setupConvex()` and `initConvex()` now throw when called with a different URL while a client already exists, instead of silently reusing the old deployment's client.

## 0.13.0

### Minor Changes

- 874612c: ### Features
  - **Authentication** - `setupAuth()` and `useAuth()` for reactive auth state management. Includes SSR hydration via `initialState` option.
  - **`getConvexClient()`** - retrieves the Convex client from a module-level singleton, working anywhere (`.ts`, `.svelte`, hooks) as long as `setupConvex()` has been called first.
  - **SvelteKit subpath** (`convex-svelte/sveltekit`) - new export with SvelteKit-specific helpers:
    - `convexLoad()` - SSR data fetching that auto-upgrades to live subscriptions on the client
    - `createConvexHttpClient()` - server-side HTTP client helper with auth token support
    - `getConvexUrl()` - retrieve the deployment URL set by `initConvex()` or `setupConvex()`
  - **`convexLoadPaginated()`** - SSR-compatible paginated query loading. Fetches the first page on the server and automatically upgrades to a live paginated subscription on the client, with `loadMore()` support for incremental loading.
  - **`useMutation()`** / **`useAction()`** - thin wrappers that return callable functions for mutations and actions. They work in `.svelte` components and plain `.ts` / `.js` files.
  - **`withServerConvexToken(token, fn)`** - new server-only helper (exported from `convex-svelte/sveltekit/server`) that stores the auth token in request-scoped `AsyncLocalStorage`. Wrap your SvelteKit `resolve()` call with it in `hooks.server.ts` and `convexLoad` / `createConvexHttpClient` will automatically use the token during SSR.
  - **Automatic server-side token** for `convexLoad`, `convexLoadPaginated`, and `createConvexHttpClient` - when no explicit `{ token }` option is provided, the server path falls back to the token set by `withServerConvexToken`.
  - **New export path `convex-svelte/sveltekit/server`** - server-only utilities that depend on `node:async_hooks`. Currently exports `withServerConvexToken`.
  - **Skip support for `convexLoad` / `convexLoadPaginated`** - pass `'skip'` as args to avoid fetching. Useful for auth-gated queries that should not run when the user is unauthenticated.

  ### Fixes
  - Use authenticated singleton `ConvexClient` for client-side initial fetches in `convexLoad()` and `convexLoadPaginated()` instead of creating new HTTP clients.
  - Prevent flash of `null` query results during SSR hydration by calling `client.setAuth()` synchronously during `setupAuth()` initialization.
  - Add deferred subscription queue to prevent auth gap between `transport.decode` and `setupAuth`.
  - Add `isLoading`, `error`, and `isStale` properties to `ConvexLoadResult` for consistent query state interface.

  ### Improvements
  - Expose `UsePaginatedQuery` types and consolidate API reference table with type exports.
  - Raise peer dependency floors to `convex@^1.30.0` and `svelte@^5.19.0`. `convex-svelte` relies on Convex 1.30.0 behavior for paginated query SSR hydration, and on Svelte 5.19.0 compiler fixes for TypeScript/runes syntax.
  - Explicit `{ token }` option still takes priority (fully backward compatible). Client-side navigation still uses the authenticated singleton.
  - Restructured README with expanded installation guide, client access patterns, SSR performance rationale, and API reference.

  ### Docs
  - Fully reworked documentation with complete examples and in-depth explanations covering all features.
  - Added guidance on choosing between `+page.ts` (universal) and `+page.server.ts` (server-only) for `convexLoad`.
