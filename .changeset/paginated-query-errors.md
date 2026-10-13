---
'convex-svelte': patch
---

### Fixes

- **Failed paginated queries no longer throw during setup** ([#61](https://github.com/get-convex/convex-svelte/issues/61)) - the Convex client throws from `getCurrentValue()` once a page has failed, and from `onPaginatedUpdate_experimental()` when another subscriber already holds the query in a failed state. `usePaginatedQuery`, `convexLoadPaginated` and `createDetachedPaginatedQuery` now report these errors through `error` instead of throwing, and always clean up their subscription.
- **`InvalidCursor` no longer resets forever** ([#61](https://github.com/get-convex/convex-svelte/issues/61)) - a paginated query resets once on `InvalidCursor`. If the cursor fails again before a page arrived, the error is shown instead of resetting in a loop. A loaded page, changed args or `reset()` allow the next reset.
- **`convexLoadPaginated` recovers from `InvalidCursor`** - it reset its state but never resubscribed, so it stayed in `LoadingFirstPage`. It now starts a fresh subscription, and a load waiting for its first page keeps waiting for it.
