---
'convex-svelte': patch
---

Fix `usePaginatedQuery` with `keepPreviousData` so existing paginated results stay visible while new query arguments load. This prevents transient empty states during search/filter changes.
