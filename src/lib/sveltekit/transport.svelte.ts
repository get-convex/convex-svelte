/**
 * SSR bridge — convexLoad() / convexLoadPaginated() + transport encode/decode.
 *
 * On the server, convexLoad fetches via ConvexHttpClient (auth-aware if token provided).
 * On the client, transport.decode upgrades it to a live subscription.
 * On client-side navigation, convexLoad opens a live subscription directly and
 * awaits its first value. While the initial page hydrates, it reuses the server's
 * result from the SSR payload instead (see hydration.ts).
 *
 * Subscriptions created here are route-scoped: they are released once the current
 * route no longer uses them (see query-lifecycle.ts).
 */
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import { ConvexHttpClient } from 'convex/browser';
import { getConvexUrl, _getServerToken } from '../internal/singleton.js';
import {
	createDetachedQuery,
	openDetachedQuery,
	type DetachedQueryResult
} from './query-detached.svelte.js';
import {
	createDetachedPaginatedQuery,
	openDetachedPaginatedQuery,
	type DetachedPaginatedQueryResult
} from './paginated-query-detached.svelte.js';
import type { PageItem, PaginatedReturnType, WithoutPaginationOpts } from '../shared/types.js';
import { recordForHydration, takeHydratedValue, warnHydrationMiss } from './hydration.js';
import { paginatedQueryKey, queryKey } from './query-key.js';

const IS_BROWSER = typeof globalThis.document !== 'undefined';

/**
 * Marker class for transport.encode to recognize.
 * Wraps the server-fetched data along with the query reference and args
 * so transport.decode can upgrade it to a live subscription.
 */
export class ConvexLoadResult<T = unknown> {
	readonly __convexLoad = true;

	/** Always `false` — data was already fetched on the server. */
	readonly isLoading = false;

	/** Always `undefined` — the server fetch succeeded. */
	readonly error: undefined = undefined;

	/** Always `false` — fresh from the server. */
	readonly isStale = false;

	constructor(
		public readonly refName: string,
		public readonly args: Record<string, unknown>,
		public readonly data: T,
		public readonly keepAlive = true
	) {}

	/** No-op on the server — the live subscription only exists after client hydration. */
	dispose(): void {}
}

/**
 * Fetch Convex data for use in SvelteKit load functions.
 *
 * - **Server (SSR):** fetches via `ConvexHttpClient`, returns `ConvexLoadResult`.
 *   The SvelteKit transport hook decodes it into a live subscription on the client.
 * - **Client (navigation):** creates a live subscription directly via
 *   `createDetachedQuery()` with HTTP-fetched initial data.
 *
 * @example
 * ```ts
 * // +page.ts (universal load function)
 * import { convexLoad } from 'convex-svelte/sveltekit';
 * import { api } from '$convex/_generated/api';
 *
 * export const load = async () => ({
 *   tasks: await convexLoad(api.tasks.get, {})
 * });
 * ```
 *
 * @param ref - A query FunctionReference like `api.tasks.get`.
 * @param args - Arguments for the query.
 * @param options - Optional `{ token }` for authenticated server-side fetches,
 * `{ keepAlive: false }` to unsubscribe as soon as the route no longer uses the query,
 * and `{ hydrate: false }` to leave the result out of the SSR payload
 * (see `convexLoadHydration`).
 */
export async function convexLoad<Query extends FunctionReference<'query'>>(
	ref: Query,
	args: FunctionArgs<Query> | 'skip',
	options?: { token?: string; keepAlive?: boolean; hydrate?: boolean }
): Promise<DetachedQueryResult<Query>> {
	if (args === 'skip') {
		return {
			data: undefined,
			isLoading: false,
			error: undefined,
			isStale: false,
			dispose: () => {}
		} as DetachedQueryResult<Query>;
	}
	const keepAlive = options?.keepAlive ?? true;

	const name = getFunctionName(ref);
	const key = queryKey(name, args as Record<string, unknown>);

	if (IS_BROWSER) {
		// Initial page hydration: reuse the server's result. The subscription is
		// deferred until setupAuth / setupConvex, so it never runs unauthenticated.
		const hydrated = options?.hydrate === false ? undefined : takeHydratedValue(key);
		if (hydrated) {
			return createDetachedQuery(ref, args, hydrated.value as FunctionReturnType<Query>, {
				scope: 'route',
				keepAlive
			});
		}
		if (options?.hydrate !== false) warnHydrationMiss(name);
		// Client-side navigation: open the live subscription on the authenticated
		// singleton ConvexClient and use its first value as the initial data —
		// one subscription instead of a one-shot query followed by a subscription.
		const { result, firstValue } = openDetachedQuery(ref, args, undefined, {
			scope: 'route',
			keepAlive,
			immediate: true
		});
		try {
			await firstValue;
		} catch (e) {
			result.dispose();
			throw e;
		}
		return result;
	}

	// Server-side: HTTP fetch, wrap in ConvexLoadResult for transport.
	// transport.decode replaces this with a DetachedQueryResult on the client.
	const httpClient = new ConvexHttpClient(getConvexUrl());
	const token = options?.token ?? _getServerToken();
	if (token) {
		httpClient.setAuth(token);
	}
	const data = await httpClient.query(ref, args);
	const result = new ConvexLoadResult(name, args as Record<string, unknown>, data, keepAlive);
	if (options?.hydrate !== false) {
		recordForHydration(key, data);
	}
	return result as unknown as DetachedQueryResult<Query>;
}

/**
 * Encode a `ConvexLoadResult` for serialization across the SSR boundary.
 * Use in SvelteKit's `transport` hook (`hooks.ts`).
 *
 * @example
 * ```ts
 * // hooks.ts
 * import { encodeConvexLoad, decodeConvexLoad } from 'convex-svelte/sveltekit';
 *
 * export const transport = {
 *   ConvexLoadResult: {
 *     encode: encodeConvexLoad,
 *     decode: decodeConvexLoad
 *   }
 * };
 * ```
 */
export function encodeConvexLoad(
	value: unknown
): false | { refName: string; args: Record<string, unknown>; data: unknown; keepAlive: boolean } {
	if (
		value instanceof ConvexLoadResult ||
		(value != null && typeof value === 'object' && '__convexLoad' in value)
	) {
		const v = value as ConvexLoadResult;
		return { refName: v.refName, args: v.args, data: v.data, keepAlive: v.keepAlive };
	}
	return false;
}

/**
 * Decode a serialized `ConvexLoadResult` into a live query subscription.
 * Uses `createDetachedQuery` — works outside component context (transport.decode).
 */
export function decodeConvexLoad(encoded: {
	refName: string;
	args: Record<string, unknown>;
	data: unknown;
	keepAlive?: boolean;
}): DetachedQueryResult<FunctionReference<'query'>> {
	const ref = makeFunctionReference<'query'>(encoded.refName);
	return createDetachedQuery(ref, encoded.args, encoded.data, {
		scope: 'route',
		keepAlive: encoded.keepAlive ?? true
	});
}

// ═══════════════════════════════════════════════════════════════════════════
// Paginated SSR bridge — convexLoadPaginated() + transport encode/decode
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Marker class for paginated SSR results.
 * Wraps the first page of server-fetched data along with query metadata
 * so transport.decode can upgrade it to a live paginated subscription.
 */
export class ConvexLoadPaginatedResult<T = unknown> {
	readonly __convexLoadPaginated = true;

	/** Always `false` — first page was already fetched on the server. */
	readonly isLoading = false;

	/** Always `undefined` — the server fetch succeeded. */
	readonly error: undefined = undefined;

	constructor(
		public readonly refName: string,
		public readonly args: Record<string, unknown>,
		public readonly initialNumItems: number,
		public readonly data: PaginatedReturnType<T>,
		public readonly keepAlive = true
	) {}

	/** Convenience: the first page of results. */
	get results(): T[] {
		return this.data.page;
	}

	/** Convenience: pagination status derived from server data. */
	get status(): string {
		return this.data.isDone ? 'Exhausted' : 'CanLoadMore';
	}

	/** No-op on the server — loadMore only works after client hydration. */
	loadMore(): boolean {
		return false;
	}

	/** No-op on the server — the live subscription only exists after client hydration. */
	dispose(): void {}
}

/**
 * Fetch the first page of a paginated Convex query for SSR, with live upgrade on the client.
 *
 * - **Server (SSR):** fetches via `ConvexHttpClient`, returns `ConvexLoadPaginatedResult`.
 *   The SvelteKit transport hook decodes it into a live paginated subscription on the client.
 * - **Client (navigation):** fetches initial page, then creates a live paginated subscription
 *   via `createDetachedPaginatedQuery()`.
 *
 * @example
 * ```ts
 * // +page.ts (universal load function)
 * import { convexLoadPaginated } from 'convex-svelte/sveltekit';
 * import { api } from '$convex/_generated/api';
 *
 * export const load = async () => ({
 *   messages: await convexLoadPaginated(api.messages.paginatedList, { searchWords: [] }, {
 *     initialNumItems: 10
 *   })
 * });
 * ```
 *
 * @param ref - A FunctionReference to a paginated query.
 * @param args - Query arguments (without `paginationOpts` — managed automatically).
 * @param options - `{ initialNumItems }` (required), optional `{ token }` for auth,
 * `{ keepAlive: false }` to unsubscribe as soon as the route no longer uses the query,
 * and `{ hydrate: false }` to leave the first page out of the SSR payload.
 */
export async function convexLoadPaginated<Query extends FunctionReference<'query'>>(
	ref: Query,
	args: WithoutPaginationOpts<FunctionArgs<Query>> | 'skip',
	options: { initialNumItems: number; token?: string; keepAlive?: boolean; hydrate?: boolean }
): Promise<DetachedPaginatedQueryResult<Query>> {
	if (args === 'skip') {
		return {
			results: [],
			status: 'Exhausted',
			isLoading: false,
			error: undefined,
			loadMore: () => false,
			dispose: () => {}
		} as DetachedPaginatedQueryResult<Query>;
	}
	const keepAlive = options.keepAlive ?? true;
	const name = getFunctionName(ref);
	const key = paginatedQueryKey(name, args as Record<string, unknown>, options.initialNumItems);

	if (IS_BROWSER) {
		// Initial page hydration: reuse the server's first page (see convexLoad).
		const hydrated = options.hydrate === false ? undefined : takeHydratedValue(key);
		if (hydrated) {
			return createDetachedPaginatedQuery(ref, args, {
				initialNumItems: options.initialNumItems,
				initialData: hydrated.value as PaginatedReturnType<PageItem<Query>>,
				scope: 'route',
				keepAlive
			});
		}
		if (options.hydrate !== false) warnHydrationMiss(name);
		// Client-side navigation: open the live paginated subscription and use its
		// first page — a one-shot query could not reuse it anyway, since the
		// subscription's pagination args differ.
		const { result, firstValue } = openDetachedPaginatedQuery(ref, args, {
			initialNumItems: options.initialNumItems,
			scope: 'route',
			keepAlive,
			immediate: true
		});
		try {
			await firstValue;
		} catch (e) {
			result.dispose();
			throw e;
		}
		return result;
	}

	// Server-side: HTTP fetch of the first page, wrap in marker class for transport
	const fullArgs = {
		...args,
		paginationOpts: { numItems: options.initialNumItems, cursor: null }
	} as FunctionArgs<Query>;
	const httpClient = new ConvexHttpClient(getConvexUrl());
	const token = options.token ?? _getServerToken();
	if (token) {
		httpClient.setAuth(token);
	}
	const data = (await httpClient.query(ref, fullArgs)) as PaginatedReturnType<PageItem<Query>>;
	const result = new ConvexLoadPaginatedResult(
		name,
		args as Record<string, unknown>,
		options.initialNumItems,
		data,
		keepAlive
	);
	if (options.hydrate !== false) {
		recordForHydration(key, data);
	}
	return result as unknown as DetachedPaginatedQueryResult<Query>;
}

/**
 * Encode a `ConvexLoadPaginatedResult` for serialization across the SSR boundary.
 * Use in SvelteKit's `transport` hook (`hooks.ts`).
 *
 * @example
 * ```ts
 * // hooks.ts
 * import {
 *   encodeConvexLoad, decodeConvexLoad,
 *   encodeConvexLoadPaginated, decodeConvexLoadPaginated
 * } from 'convex-svelte/sveltekit';
 *
 * export const transport = {
 *   ConvexLoadResult: { encode: encodeConvexLoad, decode: decodeConvexLoad },
 *   ConvexLoadPaginatedResult: { encode: encodeConvexLoadPaginated, decode: decodeConvexLoadPaginated }
 * };
 * ```
 */
export function encodeConvexLoadPaginated(value: unknown):
	| false
	| {
			refName: string;
			args: Record<string, unknown>;
			initialNumItems: number;
			data: unknown;
			keepAlive: boolean;
	  } {
	if (
		value instanceof ConvexLoadPaginatedResult ||
		(value != null && typeof value === 'object' && '__convexLoadPaginated' in value)
	) {
		const v = value as ConvexLoadPaginatedResult;
		return {
			refName: v.refName,
			args: v.args,
			initialNumItems: v.initialNumItems,
			data: v.data,
			keepAlive: v.keepAlive
		};
	}
	return false;
}

/**
 * Decode a serialized `ConvexLoadPaginatedResult` into a live paginated subscription.
 * Uses `createDetachedPaginatedQuery` — works outside component context (transport.decode).
 */
export function decodeConvexLoadPaginated(encoded: {
	refName: string;
	args: Record<string, unknown>;
	initialNumItems: number;
	data: unknown;
	keepAlive?: boolean;
}): DetachedPaginatedQueryResult<FunctionReference<'query'>> {
	const ref = makeFunctionReference<'query'>(encoded.refName);
	return createDetachedPaginatedQuery(ref, encoded.args, {
		initialNumItems: encoded.initialNumItems,
		initialData: encoded.data as PaginatedReturnType<unknown>,
		scope: 'route',
		keepAlive: encoded.keepAlive ?? true
	});
}
