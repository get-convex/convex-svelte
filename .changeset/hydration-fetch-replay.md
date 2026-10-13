---
'convex-svelte': patch
---

### Changes

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

- **The endpoint** (`/__convex-svelte/q/<hash>` below `kit.paths.base`, one path per page, query and args, so prerendered pages work too) only accepts same-origin JSON POST requests with a valid function name and Convex JSON args, runs public queries only (Convex rejects mutations, actions and internal functions there), uses the token from `withServerConvexToken`, and marks responses `private, no-store`. If the endpoint can't be reached, `convexLoad` queries Convex directly.
- **Dev warnings** point out a universal `convexLoad` without `fetch`, `{ fetch }` without the handle, and a handle placed before the auth handle.
