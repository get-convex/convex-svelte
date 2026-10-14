---
'convex-svelte': patch
---

### Fixes

- **No WebSocket during server rendering** - the client created by `setupConvex()` / `initConvex()` is now always disabled on the server, even when a caller passes `disabled: false`. Whether code runs on the server is decided at runtime (`typeof document`) instead of by the bundler's resolution of `esm-env`.
- **Ignored client options are reported** - client options only take effect where the shared client is created, like the `ConvexReactClient` constructor in React. When `setupConvex()` or a repeated `initConvex()` passes options that differ from the ones the client was created with (e.g. `expectAuth` in the root layout while `initConvex()` in `hooks.ts` created the client), a dev warning now names them instead of dropping them silently. Only primitive options are compared; functions and objects such as `logger` get a new identity on every hot reload.
