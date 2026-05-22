/**
 * SSR bridge — convexLoad() / convexLoadPaginated() + transport encode/decode.
 *
 * On the server, convexLoad fetches via ConvexHttpClient (auth-aware if token provided).
 * On the client, transport.decode upgrades it to a live subscription.
 * On client-side navigation, convexLoad creates a live subscription directly.
 */
import type { FunctionReference, FunctionArgs } from 'convex/server';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import { ConvexHttpClient } from 'convex/browser';
import { getConvexUrl, getConvexClient, _getServerToken } from '../internal/singleton.js';
import { createDetachedQuery, type DetachedQueryResult } from './query-detached.svelte.js';
import {
	createDetachedPaginatedQuery,
	type DetachedPaginatedQueryResult
} from './paginated-query-detached.svelte.js';
import type { PageItem, PaginatedReturnType, WithoutPaginationOpts } from '../shared/types.js';

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
		public readonly data: T
	) {}
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
 * @param options - Optional `{ token }` for authenticated server-side fetches.
 */
export async function convexLoad<Query extends FunctionReference<'query'>>(
	ref: Query,
	args: FunctionArgs<Query> | 'skip',
	options?: { token?: string }
): Promise<DetachedQueryResult<Query>> {
	if (args === 'skip') {
		return {
			data: undefined,
			isLoading: false,
			error: undefined,
			isStale: false
		} as DetachedQueryResult<Query>;
	}

	if (IS_BROWSER) {
		// Client-side navigation: use the authenticated singleton ConvexClient
		// for the initial fetch, then create a live subscription.
		const client = getConvexClient();
		const initialData = await client.query(ref, args);
		return createDetachedQuery(ref, args, initialData) as DetachedQueryResult<Query>;
	}

	// Server-side: HTTP fetch, wrap in ConvexLoadResult for transport.
	// transport.decode replaces this with a DetachedQueryResult on the client.
	const httpClient = new ConvexHttpClient(getConvexUrl());
	const token = options?.token ?? _getServerToken();
	if (token) {
		httpClient.setAuth(token);
	}
	const data = await httpClient.query(ref, args);
	const name = getFunctionName(ref);
	return new ConvexLoadResult(
		name,
		args as Record<string, unknown>,
		data
	) as unknown as DetachedQueryResult<Query>;
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
): false | { refName: string; args: Record<string, unknown>; data: unknown } {
	if (
		value instanceof ConvexLoadResult ||
		(value != null && typeof value === 'object' && '__convexLoad' in value)
	) {
		const v = value as ConvexLoadResult;
		return { refName: v.refName, args: v.args, data: v.data };
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
}): DetachedQueryResult<FunctionReference<'query'>> {
	const ref = makeFunctionReference<'query'>(encoded.refName);
	return createDetachedQuery(ref, encoded.args, encoded.data);
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
		public readonly data: PaginatedReturnType<T>
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
 *   messages: await convexLoadPaginated(api.messages.paginatedList, { muteWords: [] }, {
 *     initialNumItems: 10
 *   })
 * });
 * ```
 *
 * @param ref - A FunctionReference to a paginated query.
 * @param args - Query arguments (without `paginationOpts` — managed automatically).
 * @param options - `{ initialNumItems }` (required), optional `{ token }` for auth.
 */
export async function convexLoadPaginated<Query extends FunctionReference<'query'>>(
	ref: Query,
	args: WithoutPaginationOpts<FunctionArgs<Query>> | 'skip',
	options: { initialNumItems: number; token?: string }
): Promise<DetachedPaginatedQueryResult<Query>> {
	if (args === 'skip') {
		return {
			results: [],
			status: 'Exhausted',
			isLoading: false,
			error: undefined,
			loadMore: () => false
		} as DetachedPaginatedQueryResult<Query>;
	}

	// Fetch the first page
	const fullArgs = {
		...args,
		paginationOpts: { numItems: options.initialNumItems, cursor: null }
	} as FunctionArgs<Query>;

	if (IS_BROWSER) {
		// Client-side navigation: use the authenticated singleton ConvexClient
		const client = getConvexClient();
		const data = (await client.query(ref, fullArgs)) as PaginatedReturnType<PageItem<Query>>;
		return createDetachedPaginatedQuery(ref, args, {
			initialNumItems: options.initialNumItems,
			initialData: data
		});
	}

	// Server-side: HTTP fetch, wrap in marker class for transport
	const httpClient = new ConvexHttpClient(getConvexUrl());
	const token = options.token ?? _getServerToken();
	if (token) {
		httpClient.setAuth(token);
	}
	const data = (await httpClient.query(ref, fullArgs)) as PaginatedReturnType<PageItem<Query>>;
	const name = getFunctionName(ref);
	return new ConvexLoadPaginatedResult(
		name,
		args as Record<string, unknown>,
		options.initialNumItems,
		data
	) as unknown as DetachedPaginatedQueryResult<Query>;
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
			data: v.data
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
}): DetachedPaginatedQueryResult<FunctionReference<'query'>> {
	const ref = makeFunctionReference<'query'>(encoded.refName);
	return createDetachedPaginatedQuery(ref, encoded.args, {
		initialNumItems: encoded.initialNumItems,
		initialData: encoded.data as PaginatedReturnType<unknown>
	});
}
