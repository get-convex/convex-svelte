import type { PaginationStatus } from 'convex/browser';
import type { FunctionReference, PaginationOptions } from 'convex/server';
import type { Value } from 'convex/values';

/**
 * A user-level argument for a query:
 *   - Either an object of Convex Values
 *   - Or the string "skip", which means “do not run/subscribe this query”
 *
 * Current frameworks:
 *   - React: already supports "skip" in `useQuery` (but not as a function).
 *   - Svelte/Vue/Solid: can use the same "skip" string at their API boundary.
 *
 * This type captures the *public* shape clients might accept.
 */
export type MaybeSkipArgs = Record<string, Value> | 'skip';

/**
 * Extended shape for frameworks that support closures for args:
 *   - Either the raw args / "skip"
 *   - Or a function returning those
 *
 * Current frameworks:
 *   - Svelte (and likely Vue/Solid) benefit from this for reactivity.
 *   - React does *not* support the function form today, but can still
 *     use `MaybeSkipArgs` as the subset it cares about.
 *
 * Why this is shared:
 *   - It lets all clients share one “normalized” representation of their
 *     incoming args, even if they only use a subset of it.
 */
export type MaybeSkipArgsOrFn = MaybeSkipArgs | (() => MaybeSkipArgs);

/**
 * Remove any `paginationOpts` field from a query’s args type.
 *
 * Paginated queries in Convex expect `paginationOpts` to be provided by
 * the pagination helper (e.g. `usePaginatedQuery`), not by application code.
 *
 * Current usage:
 *   - Svelte uses this type today to prevent users from manually passing
 *     `paginationOpts`.
 *   - React can use the same type to express the same constraint.
 *
 * Why this is shared:
 *   - The "don’t pass paginationOpts yourself" rule is a Convex invariant,
 *     not a Svelte-specific one.
 */
export type WithoutPaginationOpts<Args> = Args extends { paginationOpts: PaginationOptions }
	? Omit<Args, 'paginationOpts'> & { paginationOpts?: never }
	: Args & { paginationOpts?: never };

/**
 * The return shape of a Convex paginated query.
 *
 * Convex paginated queries return:
 *   { page: T[]; isDone: boolean; continueCursor: string }
 *
 * This type is used for:
 *   - `initialData` in paginated query options (SSR hydration)
 *   - Type-safe validation of paginated query returns
 */
export type PaginatedReturnType<T> = {
	page: T[];
	isDone: boolean;
	continueCursor: string;
};

/**
 * Extract the element type from a paginated query’s return type.
 *
 * Convex paginated queries return something like:
 *   { page: T[]; isDone: boolean; continueCursor: string }
 *
 * This helper extracts the `T`.
 *
 * Current usage:
 *   - Svelte: used for `UsePaginatedQueryReturn<Query>`.
 *   - React: currently inlines similar logic; this makes it reusable.
 */
export type PageItem<Query extends FunctionReference<'query'>> = Query['_returnType'] extends {
	page: (infer Item)[];
}
	? Item
	: never;

/**
 * Framework-agnostic pagination options.
 *
 * This is the minimal options object needed by the shared pagination
 * client (e.g. `PaginatedQueryClient` and `usePaginatedQuery_experimental`).
 *
 * Current frameworks:
 *   - React: matches its existing `usePaginatedQuery` options.
 *   - Svelte: extends this in its own layer with `initialData` and
 *             `keepPreviousData`, which are Svelte-specific UX enhancements.
 *
 * Why this is shared:
 *   - It defines the common contract that all pagination hooks should
 *     support, regardless of framework.
 */
export type UsePaginatedQueryOptions = {
	/**
	 * Number of items to load in the first page.
	 */
	initialNumItems: number;
};

/**
 * The minimal shape that a `usePaginatedQuery`-style hook returns.
 *
 * React’s `usePaginatedQuery` already matches this structure:
 *   - `results`: flattened list of all loaded items
 *   - `status`: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"
 *   - `isLoading`: convenience flag derived from `status`
 *   - `loadMore`: request more items
 *
 * Svelte extends this in its own hook to include an `error` field, which is
 * a Svelte-specific choice (React leans on Error Boundaries instead).
 *
 * Why this is shared:
 *   - It documents the baseline pagination contract that all client
 *     frameworks should adhere to.
 *   - Additional fields can be added per-framework without diverging on the core.
 */
export type UsePaginatedQueryReturn<Query extends FunctionReference<'query'>> = {
	results: PageItem<Query>[];
	status: PaginationStatus;
	isLoading: boolean;
	loadMore: (numItems: number) => boolean;
};
