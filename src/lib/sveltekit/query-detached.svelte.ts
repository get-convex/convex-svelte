/**
 * createDetachedQuery — live Convex subscription without component context.
 *
 * Used by `transport.decode` and `convexLoad()` on client-side navigation.
 * Route-scoped queries (the ones `convexLoad()` creates) are released once the
 * current route no longer uses them — see `query-lifecycle.ts`. Manually scoped
 * queries live until `dispose()` is called or the ConvexClient is closed.
 */
import type { FunctionReference, FunctionReturnType, FunctionArgs } from 'convex/server';
import { getConvexClient, deferSubscription } from '../internal/singleton.js';
import { isClientActive } from '../internal/client_status.js';
import { markRouteQuery, type SubscriptionHandle } from './query-lifecycle.js';
import { createRouteQuery } from './route-data.svelte.js';

export type DetachedQueryResult<Query extends FunctionReference<'query'>> = {
	readonly data: FunctionReturnType<Query> | undefined;
	readonly isLoading: boolean;
	readonly error: Error | undefined;
	/** `true` while the subscription is released and `data` may be outdated. */
	readonly isStale: boolean;
	/** Stop the live subscription permanently. Safe to call multiple times. */
	dispose(): void;
};

export type DetachedQueryOptions = {
	/**
	 * - `'manual'` (default): the subscription lives until `dispose()` is called
	 *   or the ConvexClient is closed.
	 * - `'route'`: the subscription is released once the current SvelteKit
	 *   route no longer uses it. Used by `convexLoad()`.
	 */
	scope?: 'manual' | 'route';
	/**
	 * Route scope only: keep the subscription in the idle buffer after release
	 * (see `initConvex({ keepAlive })`). `false` unsubscribes right away.
	 * @default true
	 */
	keepAlive?: boolean;
};

/**
 * Create a live Convex subscription without `$effect` (no component context needed).
 * `$state` works outside components — it compiles to raw signals.
 *
 * @param query - A FunctionReference like `api.tasks.get`.
 * @param args - Arguments for the query.
 * @param initialData - Optional initial data (e.g. from SSR).
 * @param options - Subscription lifecycle, see {@link DetachedQueryOptions}.
 */
export function createDetachedQuery<Query extends FunctionReference<'query'>>(
	query: Query,
	args: FunctionArgs<Query>,
	initialData?: FunctionReturnType<Query>,
	options: DetachedQueryOptions = {}
): DetachedQueryResult<Query> {
	const client = getConvexClient();

	let data: FunctionReturnType<Query> | undefined = $state(initialData);
	let error: Error | undefined = $state(undefined);
	let isStale = $state(false);

	let unsubscribe: (() => void) | undefined;
	let wanted = false;

	const handle: SubscriptionHandle = {
		open() {
			wanted = true;
			// Defer subscription until setupAuth (or setupConvex for no-auth apps)
			// calls flushDeferredSubscriptions(). This prevents auth gap: transport.decode
			// runs before setupAuth can call client.setAuth(), so without deferral,
			// subscriptions would fire on an unauthenticated WebSocket.
			deferSubscription(() => {
				// Skip if closed again before the deferred subscribe ran, or already open.
				if (!wanted || unsubscribe || !isClientActive(client)) return;

				unsubscribe = client.onUpdate(
					query,
					args,
					(result: FunctionReturnType<Query>) => {
						data = structuredClone(result);
						isStale = false;
					},
					(e: Error) => {
						error = e;
						isStale = false;
					}
				);
			});
		},
		close() {
			wanted = false;
			if (!unsubscribe) return;
			unsubscribe();
			unsubscribe = undefined;
			isStale = true;
		}
	};

	const createResult = (track: () => void, dispose: () => void): DetachedQueryResult<Query> => ({
		get data() {
			track();
			return data;
		},
		get isLoading() {
			track();
			return error === undefined && data === undefined;
		},
		get error() {
			track();
			return error;
		},
		get isStale() {
			track();
			return isStale;
		},
		dispose
	});

	if (options.scope !== 'route') {
		handle.open();
		return createResult(
			() => {},
			() => handle.close()
		);
	}

	const route = createRouteQuery(handle, options.keepAlive ?? true);
	return markRouteQuery(
		createResult(route.track, () => route.query.dispose()),
		route.query
	);
}
