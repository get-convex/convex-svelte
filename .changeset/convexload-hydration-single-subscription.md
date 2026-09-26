---
'convex-svelte': minor
---

### Fixes

- **`convexLoad` in `+page.ts` no longer queries without auth during hydration** - SvelteKit re-runs universal load functions in the browser during hydration, before `setupAuth()` has authenticated the client. `convexLoad` / `convexLoadPaginated` therefore queried Convex unauthenticated, replacing the server-rendered data with anonymous results (or failing the load for auth-protected queries). With the new `convexLoadHydration` handle, the server embeds its results in the HTML and hydration reuses them. The live subscription starts after auth, and the page becomes interactive without waiting for the WebSocket.
- **One subscription per `convexLoad`** - on client-side navigation, `convexLoad` ran a one-shot query and then subscribed again (Add → Remove → Add on the WebSocket), executing the query twice. It now opens the live subscription and awaits its first value. `convexLoadPaginated` no longer fetches the first page twice.

### Features

- **`convexLoadHydration`** - new SvelteKit `handle` exported from the new entry point `convex-svelte/sveltekit/server/hydration` (requires SvelteKit 2.56 or later). Add it to `hooks.server.ts` (combine with your own handle via `sequence()`) to embed `convexLoad` results of universal loads in the SSR HTML. Everything `convexLoad` fetches while a universal load runs is embedded, including calls in helpers it invokes. Server loads (`+page.server.ts`) never contribute, not even results they use internally, and the ones they return reach the browser through the transport. Universal loads are detected via SvelteKit's internal `is_in_universal_load` request-store flag (also used by SvelteKit's remote functions). If it can't be read, nothing is embedded and a warning is logged. It's a separate entry point so that `convex-svelte/sveltekit/server` keeps working on older SvelteKit versions. A streamed (not awaited) `convexLoad` result is only embedded if it finished before the page HTML was generated; in development, a warning points out loads that miss the payload during hydration.
- **`hydrate: false`** - `convexLoad` / `convexLoadPaginated` option to leave a result out of the SSR payload, e.g. a large one. That load then queries Convex during hydration, before `setupAuth()`, as it did without the handle.
