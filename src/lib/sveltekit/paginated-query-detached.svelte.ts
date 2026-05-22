/**
 * createDetachedPaginatedQuery — live paginated Convex subscription without component context.
 *
 * Used by `transport.decode` for paginated SSR results and `convexLoadPaginated()` on
 * client-side navigation. The subscription lives until the ConvexClient is closed.
 *
 * Unlike `usePaginatedQuery` (which requires Svelte component context for `useConvexClient`),
 * this uses the module-level singleton via `getConvexClient()`.
 */
import type { PaginationStatus } from 'convex/browser';
import type { FunctionReference, FunctionArgs } from 'convex/server';
import type { Value } from 'convex/values';
import { getConvexClient, deferSubscription } from '../internal/singleton.js';
import type { PageItem, PaginatedReturnType, WithoutPaginationOpts } from '../shared/types.js';
import {
	PaginatedQueryStateMachine,
	serializeArgsKey,
	type PaginatedQueryConfig
} from '../shared/paginated_query_state.js';

export type DetachedPaginatedQueryResult<Query extends FunctionReference<'query'>> = {
	readonly results: PageItem<Query>[];
	readonly status: PaginationStatus;
	readonly isLoading: boolean;
	readonly error: Error | undefined;
	loadMore(numItems: number): boolean;
};

/**
 * Create a live paginated Convex subscription without component context.
 * Uses `$state` (compiles to raw signals — works outside components).
 *
 * @param query - A FunctionReference to a paginated query.
 * @param args - Query arguments (without paginationOpts).
 * @param options - Configuration: `initialNumItems`, optional `initialData`.
 */
export function createDetachedPaginatedQuery<Query extends FunctionReference<'query'>>(
	query: Query,
	args: WithoutPaginationOpts<FunctionArgs<Query>>,
	options: {
		initialNumItems: number;
		initialData?: PaginatedReturnType<PageItem<Query>>;
	}
): DetachedPaginatedQueryResult<Query> {
	const client = getConvexClient();

	// Create the framework-agnostic state machine
	const machineConfig: PaginatedQueryConfig<PageItem<Query>> = {
		initialNumItems: options.initialNumItems,
		initialData: options.initialData,
		keepPreviousData: true
	};
	const machine = new PaginatedQueryStateMachine<PageItem<Query>>(machineConfig);

	// Svelte reactive state mirroring machine state
	const snapshot = machine.getSnapshot();
	let results: PageItem<Query>[] = $state(snapshot.results);
	let status: PaginationStatus = $state(snapshot.status);
	let isLoading: boolean = $state(snapshot.isLoading);
	let error: Error | undefined = $state(snapshot.error);
	let loadMoreFn: (numItems: number) => boolean = $state(snapshot.loadMore);

	// Sync machine snapshot → $state variables.
	// Called directly after every machine mutation to ensure Svelte signals fire.
	function syncState(): void {
		const s = machine.getSnapshot();
		results = s.results;
		status = s.status;
		isLoading = s.isLoading;
		error = s.error;
		loadMoreFn = s.loadMore;
	}

	if (!client.disabled) {
		// Notify machine of initial args
		const argsKey = serializeArgsKey(args as Record<string, Value>);
		machine.onArgsChange(argsKey);

		// Defer subscription until setupAuth (or setupConvex for no-auth apps)
		// calls flushDeferredSubscriptions(). See query-detached.svelte.ts.
		deferSubscription(() => {
			// Create subscription
			const unsubscribe = client.onPaginatedUpdate_experimental(
				query,
				args,
				{ initialNumItems: options.initialNumItems },
				() => {
					const current = unsubscribe.getCurrentValue?.();
					if (!current) return;
					machine.onUpdate({
						results: current.results as PageItem<Query>[],
						status: current.status,
						loadMore: (numItems: number) => current.loadMore(numItems)
					});
					syncState();
				},
				(e: Error) => {
					machine.onError(e);
					syncState();
				}
			);

			// Check for synchronously available cached value
			const current = unsubscribe.getCurrentValue?.();
			if (current) {
				machine.onUpdate({
					results: current.results as PageItem<Query>[],
					status: current.status,
					loadMore: (numItems: number) => current.loadMore(numItems)
				});
				syncState();
			}
		});
	}

	return {
		get results() {
			return results;
		},
		get status() {
			return status;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		loadMore(numItems: number) {
			return loadMoreFn(numItems);
		}
	};
}
