/**
 * createDetachedQuery — live Convex subscription without component context.
 *
 * Used by `transport.decode` and `convexLoad()` on client-side navigation.
 * Route-scoped queries (the ones `convexLoad()` creates) are released once the
 * current route no longer uses them — see `query-lifecycle.ts`. Manually scoped
 * queries live until `dispose()` is called or the ConvexClient is closed.
 */
import type { FunctionReference, FunctionReturnType, FunctionArgs } from 'convex/server';
import { getFunctionName } from 'convex/server';
import { getConvexClient, deferSubscription } from '../internal/singleton.js';
import { isClientActive } from '../internal/client_status.js';
import { markRouteQuery, type SubscriptionHandle } from './query-lifecycle.js';
import { queryKey } from './query-key.js';
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
	return openDetachedQuery(query, args, initialData, options).result;
}

/**
 * Like {@link createDetachedQuery}, plus the pieces `convexLoad` needs to get its
 * initial data from the live subscription instead of a separate one-shot query.
 *
 * @param options.immediate - Subscribe right away instead of via the deferred
 * queue. For loads that await `firstValue`: the queue is only flushed once the
 * root layout runs, which in turn waits for the loads.
 * @returns The result and a promise that settles with the subscription's first
 * value (rejects on a query error, or if the query is disposed before).
 * @internal
 */
export function openDetachedQuery<Query extends FunctionReference<'query'>>(
	query: Query,
	args: FunctionArgs<Query>,
	initialData: FunctionReturnType<Query> | undefined,
	options: DetachedQueryOptions & { immediate?: boolean }
): { result: DetachedQueryResult<Query>; firstValue: Promise<void> } {
	const client = getConvexClient();

	let data: FunctionReturnType<Query> | undefined = $state(initialData);
	let error: Error | undefined = $state(undefined);
	let isStale = $state(false);

	let settleFirstValue: ((error?: Error) => void) | undefined;
	const firstValue = new Promise<void>((resolve, reject) => {
		settleFirstValue = (e) => {
			settleFirstValue = undefined;
			if (e) reject(e);
			else resolve();
		};
	});
	// Only convexLoad awaits it; don't report rejections nobody listens to.
	firstValue.catch(() => {});

	const onResult = (result: FunctionReturnType<Query>) => {
		data = structuredClone(result);
		isStale = false;
		settleFirstValue?.();
	};
	const onError = (e: Error) => {
		error = e;
		isStale = false;
		settleFirstValue?.(e);
	};

	let unsubscribe: (() => void) | undefined;
	let wanted = false;
	let immediate = options.immediate ?? false;

	const subscribe = () => {
		// Skip if closed again before a deferred subscribe ran, or already open.
		if (!wanted || unsubscribe || !isClientActive(client)) return;

		const subscription = client.onUpdate(query, args, onResult, onError);
		unsubscribe = subscription;
		if (!immediate) return;
		// A live subscription (e.g. an idle one being revisited) has its value
		// already — use it now instead of waiting for the next callback.
		try {
			const current = subscription.getCurrentValue();
			if (current !== undefined) onResult(current);
		} catch (e) {
			onError(e as Error);
		}
	};

	const handle: SubscriptionHandle = {
		open() {
			// Disabled (SSR) or closed clients never subscribe. Checked before
			// queueing: the server never flushes the deferred queue.
			if (!isClientActive(client)) return;
			wanted = true;
			if (immediate) {
				subscribe();
				immediate = false;
				return;
			}
			// Defer subscription until setupAuth (or setupConvex for no-auth apps)
			// calls flushDeferredSubscriptions(). This prevents auth gap: transport.decode
			// runs before setupAuth can call client.setAuth(), so without deferral,
			// subscriptions would fire on an unauthenticated WebSocket.
			deferSubscription(subscribe);
		},
		close() {
			wanted = false;
			settleFirstValue?.(new Error('The query was disposed before its first result.'));
			if (!unsubscribe) return;
			unsubscribe();
			unsubscribe = undefined;
			isStale = true;
		}
	};

	if (options.immediate && !isClientActive(client)) {
		settleFirstValue?.(new Error('The ConvexClient is disabled or closed.'));
	}

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

	// Inactive clients never subscribe, so they need no route lifecycle (or its timers).
	if (options.scope !== 'route' || !isClientActive(client)) {
		handle.open();
		const result = createResult(
			() => {},
			() => handle.close()
		);
		return { result, firstValue };
	}

	const route = createRouteQuery(
		handle,
		options.keepAlive ?? true,
		queryKey(getFunctionName(query), args)
	);
	if (options.immediate) route.query.holdWhile(firstValue);
	const result = markRouteQuery(
		createResult(route.track, () => route.query.dispose()),
		route.query
	);
	return { result, firstValue };
}
