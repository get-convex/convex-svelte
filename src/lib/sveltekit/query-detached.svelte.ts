/**
 * createDetachedQuery — live Convex subscription without component context.
 *
 * Used by `transport.decode` and `convexLoad()` on client-side navigation.
 * The subscription lives until the ConvexClient is closed.
 */
import type { FunctionReference, FunctionReturnType, FunctionArgs } from 'convex/server';
import { getConvexClient, deferSubscription } from '../internal/singleton.js';

export type DetachedQueryResult<Query extends FunctionReference<'query'>> = {
	readonly data: FunctionReturnType<Query> | undefined;
	readonly isLoading: boolean;
	readonly error: Error | undefined;
	readonly isStale: boolean;
};

/**
 * Create a live Convex subscription without `$effect` (no component context needed).
 * `$state` works outside components — it compiles to raw signals.
 *
 * @param query - A FunctionReference like `api.tasks.get`.
 * @param args - Arguments for the query.
 * @param initialData - Optional initial data (e.g. from SSR).
 */
export function createDetachedQuery<Query extends FunctionReference<'query'>>(
	query: Query,
	args: FunctionArgs<Query>,
	initialData?: FunctionReturnType<Query>
): DetachedQueryResult<Query> {
	const client = getConvexClient();

	let data: FunctionReturnType<Query> | undefined = $state(initialData);
	let error: Error | undefined = $state(undefined);

	if (!client.disabled) {
		// Defer subscription until setupAuth (or setupConvex for no-auth apps)
		// calls flushDeferredSubscriptions(). This prevents auth gap: transport.decode
		// runs before setupAuth can call client.setAuth(), so without deferral,
		// subscriptions would fire on an unauthenticated WebSocket.
		deferSubscription(() => {
			client.onUpdate(
				query,
				args,
				(result: FunctionReturnType<Query>) => {
					data = structuredClone(result);
				},
				(e: Error) => {
					error = e;
				}
			);
		});
	}

	return {
		get data() {
			return data;
		},
		get isLoading() {
			return error === undefined && data === undefined;
		},
		get error() {
			return error;
		},
		get isStale() {
			return false;
		}
	};
}
