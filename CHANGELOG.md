# convex-svelte

## 0.15.1

### Patch Changes

- 77fe505: ### Fixes

  - **No WebSocket during server rendering** - the client created by `setupConvex()` / `initConvex()` is now always disabled on the server, even when a caller passes `disabled: false`. Whether code runs on the server is decided at runtime (`typeof document`) instead of by the bundler's resolution of `esm-env`.
  - **Ignored client options are reported** - client options only take effect where the shared client is created, like the `ConvexReactClient` constructor in React. When `setupConvex()` or a repeated `initConvex()` passes options that differ from the ones the client was created with (e.g. `expectAuth` in the root layout while `initConvex()` in `hooks.ts` created the client), a dev warning now names them instead of dropping them silently. Only primitive options are compared; functions and objects such as `logger` get a new identity on every hot reload.

- e573223: ### Changes

  - **`convexLoadHydration` now works on SvelteKit 2 and 3, built on SvelteKit's own fetch replay** - in 0.15.0 the handle embedded `convexLoad` results through a SvelteKit 2 internal flag that SvelteKit 3 removed, so it had no effect on SvelteKit 3. Now a universal load passes its `fetch` to `convexLoad`, which runs the server query through an endpoint served by the handle. SvelteKit records the response in the page and replays it during hydration, so the load neither requests nor queries Convex before `setupAuth()`. SvelteKit only records fetches of universal loads, so results of server loads never end up in the HTML.

    ```ts
    // hooks.server.ts — after your auth handle, so queries run with the user's token
    export const handle = sequence(convexAuth, convexLoadHydration);

    // +page.ts
    export const load = async ({ fetch }) => ({
    	tasks: await convexLoad(api.tasks.get, {}, { fetch })
    });
    ```

    Migrating from 0.15.0: remove `%convex.hydration%` from `app.html`, place `convexLoadHydration` after your auth handle, pass `{ fetch }` in universal loads, and drop `hydrate: false` (a load without `fetch` doesn't use the endpoint). Works with SvelteKit 2.12 or later, and needs no SvelteKit internals.

  - **The endpoint** (`/__convex-svelte/q/<hash>` below `kit.paths.base`, one path per page, query and args, so prerendered pages work too) only accepts same-origin JSON POST requests with a valid function name and Convex JSON args, runs public queries only (Convex rejects mutations, actions and internal functions there), uses the token from `withServerConvexToken`, and marks responses `private, no-store`. Only pass the requesting user's own token to `withServerConvexToken`: anyone who can send a request to your app can run any public query through the endpoint with that token, so a shared or service token would let every visitor run queries as that identity. If the endpoint can't be reached, `convexLoad` queries Convex directly.
  - **Dev warnings** point out a universal `convexLoad` without `fetch`, `{ fetch }` without the handle, and a handle placed before the auth handle.

- 8ace785: ### Fixes

  - **Failed paginated queries no longer throw during setup** ([#61](https://github.com/convex/convex-svelte/issues/61)) - the Convex client throws from `getCurrentValue()` once a page has failed, and from `onPaginatedUpdate_experimental()` when another subscriber already holds the query in a failed state. `usePaginatedQuery`, `convexLoadPaginated` and `createDetachedPaginatedQuery` now report these errors through `error` instead of throwing, and always clean up their subscription.
  - **`InvalidCursor` no longer resets forever** ([#61](https://github.com/convex/convex-svelte/issues/61)) - a paginated query resets once on `InvalidCursor`. If the cursor fails again before a page arrived, the error is shown instead of resetting in a loop. A loaded page, changed args or `reset()` allow the next reset.
  - **`convexLoadPaginated` recovers from `InvalidCursor`** - it reset its state but never resubscribed, so it stayed in `LoadingFirstPage`. It now starts a fresh subscription, and a load waiting for its first page keeps waiting for it.

- 9bfcda1: ### Fixes

  - **Skipped queries in server loads** - `convexLoad(query, 'skip')` in a `+page.server.ts` / `+layout.server.ts` load failed with `Cannot stringify a function` since 0.15.0, because the skipped result has a `dispose()` function that SvelteKit can't serialize. `convexLoadPaginated(query, 'skip', ...)` failed the same way because of its `loadMore()`. The transport hooks now send skipped results to the browser and recreate them there, with the same shape as before.

- cb4e310: ### Fixes

  - **Installs with SvelteKit 3** - the optional `@sveltejs/kit` peer dependency is now `^2.12.0 || ^3.0.0`. With `^2.12.0`, npm refused to install `convex-svelte` 0.15.0 next to SvelteKit 3 (`ERESOLVE`).
  - **No `runed` dependency** - nothing imported it any more, and its peer range (`@sveltejs/kit ^2.21.0`) caused an `ERESOLVE` warning on SvelteKit 3, and an error with `--strict-peer-deps`.

## 0.15.0

### Minor Changes

- e8d95bc: ### Fixes

  - **convexLoad in +page.ts and auth during hydration** - first version of the convexLoadHydration handle. Replaced in 0.15.1; set it up as described there.
  - **One subscription per `convexLoad`** - on client-side navigation, `convexLoad` ran a one-shot query and then subscribed again (Add → Remove → Add on the WebSocket), executing the query twice. It now opens the live subscription and awaits its first value. `convexLoadPaginated` no longer fetches the first page twice.
  - **No loading flash for paginated SSR data** - with SSR `initialData`, `convexLoadPaginated` (and `usePaginatedQuery` with `initialData`) briefly reported `isLoading: true` / `LoadingFirstPage` right after hydration, so pages rendered their loading state over the server-rendered results. The initial args and the subscription's first empty snapshot now keep the SSR results visible and not loading.

  ### Features
  - **`hydrate: false`** - `convexLoad` / `convexLoadPaginated` option to leave a result out of the SSR payload, e.g. a large one. That load then queries Convex during hydration, before `setupAuth()`, as it did without the handle.

- d7cb157: ### Breaking

  - **`convex-svelte/sveltekit` requires SvelteKit 2.12 or later**, because it now imports `$app/state`. It can no longer be imported outside a SvelteKit app, e.g. to use `createConvexHttpClient` in a Node script; use `ConvexHttpClient` from `convex/browser` there. `@sveltejs/kit@^2.12.0` is declared as an optional peer dependency.

  ### Fixes
  - **`convexLoad` / `convexLoadPaginated` subscriptions are released after leaving a route** ([#57](https://github.com/convex/convex-svelte/issues/57)) - previously every query created through `convexLoad`, `convexLoadPaginated`, or the SvelteKit transport stayed subscribed for the life of the tab, so bandwidth and function calls grew with every visited page (including hover preloads and `invalidate()` re-runs). These queries are now route-scoped: they stay subscribed while they are reachable from `page.data` (all layouts plus the current page) or rendered by a component, and are released afterwards. A released query resubscribes automatically when it is used again.
  - **Unclaimed queries are closed after 5 s** - a query that no route ever uses (a hover preload the user doesn't click, a superseded navigation) is closed after 5 s and never takes a slot in the idle buffer, so hovering over many links can't push out pages you visited. A late click resubscribes.

  ### Features
  - **Idle buffer for released queries** - released queries stay subscribed in a small buffer, so revisiting a page reuses the live subscription instead of subscribing again. A revisit replaces its idle copy instead of taking another slot. Configure it via `initConvex(url, { queryCache: { maxIdleEntries, expiration } })` (default `{ maxIdleEntries: 10, expiration: 60_000 }`), or pass `queryCache: false` to unsubscribe immediately. The option names match convex-helpers' `ConvexQueryCacheProvider`; when the buffer is full, the query idle the longest is evicted. `closeConvex()` disposes all of these queries.
  - **Per-query `keepAlive`** - `convexLoad(query, args, { keepAlive: false })` and `convexLoadPaginated(query, args, { initialNumItems, keepAlive: false })` skip the idle buffer for that query.
  - **`dispose()`** - results of `convexLoad`, `convexLoadPaginated`, `createDetachedQuery`, and `createDetachedPaginatedQuery` expose `dispose()` to stop the subscription explicitly. After `dispose()`, `loadMore()` returns `false`. `createDetachedQuery` / `createDetachedPaginatedQuery` accept `{ scope: 'route' }` to opt into route-scoped release.
  - **`isStale` on `convexLoad` results** - now `true` while a released query shows its last known data.

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
