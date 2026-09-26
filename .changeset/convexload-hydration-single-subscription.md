---
'convex-svelte': minor
---

### Fixes

- **`convexLoad` in `+page.ts` no longer queries without auth during hydration** - SvelteKit re-runs universal load functions in the browser during hydration, before `setupAuth()` has authenticated the client. `convexLoad` / `convexLoadPaginated` therefore queried Convex unauthenticated, replacing the server-rendered data with anonymous results (or failing the load for auth-protected queries). With the new `convexLoadHydration` handle, the server embeds its results in the HTML and hydration reuses them. The live subscription starts after auth, and the page becomes interactive without waiting for the WebSocket.
- **One subscription per `convexLoad`** - on client-side navigation, `convexLoad` ran a one-shot query and then subscribed again (Add → Remove → Add on the WebSocket), executing the query twice. It now opens the live subscription and awaits its first value. `convexLoadPaginated` no longer fetches the first page twice.

### Features

- **`convexLoadHydration`** - new SvelteKit `handle` exported from `convex-svelte/sveltekit/server`. Add it to `hooks.server.ts` (combine with your own handle via `sequence()`) to embed `convexLoad` results of universal loads in the SSR HTML. Only results of universal loads are embedded: server loads (`+page.server.ts`) never are, not even results they use internally, and the ones they return reach the browser through the transport. Universal loads are detected via SvelteKit's internal `is_in_universal_load` request-store flag (also used by SvelteKit's remote functions). If a SvelteKit version doesn't expose it, nothing is embedded and a warning is logged. Streamed (not awaited) `convexLoad` promises are not embedded; in development, a warning points out loads that miss the payload during hydration.
- **`hydrate: false`** - `convexLoad` / `convexLoadPaginated` option to leave a result out of the SSR payload, e.g. a large one. That load then queries Convex during hydration, before `setupAuth()`, as it did without the handle.
