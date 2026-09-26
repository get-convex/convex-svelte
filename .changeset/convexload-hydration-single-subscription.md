---
'convex-svelte': minor
---

### Fixes

- **`convexLoad` in `+page.ts` no longer queries without auth during hydration** - SvelteKit re-runs universal load functions in the browser during hydration, before `setupAuth()` has authenticated the client. `convexLoad` / `convexLoadPaginated` therefore queried Convex unauthenticated, replacing the server-rendered data with anonymous results (or failing the load for auth-protected queries). With the new `convexLoadHydration` handle, the server embeds its results in the HTML and hydration reuses them. The live subscription starts after auth, and the page becomes interactive without waiting for the WebSocket.
- **One subscription per `convexLoad`** - on client-side navigation, `convexLoad` ran a one-shot query and then subscribed again (Add → Remove → Add on the WebSocket), executing the query twice. It now opens the live subscription and awaits its first value. `convexLoadPaginated` no longer fetches the first page twice.

### Features

- **`convexLoadHydration`** - new SvelteKit `handle` exported from `convex-svelte/sveltekit/server`. Add it to `hooks.server.ts` (combine with your own handle via `sequence()`) to embed `convexLoad` results of universal loads in the SSR HTML. Results of server loads (`+page.server.ts`) already reach the browser through the transport and are not embedded again.
- **`hydrate: false`** - `convexLoad` / `convexLoadPaginated` option to leave a result out of the SSR payload, e.g. for large results.
