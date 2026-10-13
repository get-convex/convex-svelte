/**
 * Safe subscription to a Convex paginated query, shared by `usePaginatedQuery`
 * and the detached paginated query behind `convexLoadPaginated`.
 *
 * The Convex client can throw instead of calling `onError`: from
 * `getCurrentValue()` once a page has failed, and from
 * `onPaginatedUpdate_experimental()` itself when another subscriber already
 * holds the query in a failed state (get-convex/convex-js#193). Thrown errors
 * are reported through `onError` here, so callers always get a cleanup function
 * back and their state machine sees the error.
 */
import type { ConvexClient, PaginationStatus } from 'convex/browser';
import type { FunctionArgs, FunctionReference } from 'convex/server';

/** One update of a paginated query, as delivered by the Convex client. */
export type PaginatedSnapshot = {
	results: unknown[];
	status: PaginationStatus;
	loadMore: (numItems: number) => boolean;
};

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

/**
 * Subscribe and report every snapshot or error. Returns a function that ends
 * the subscription; safe to call when subscribing failed.
 */
export function subscribePaginated<Query extends FunctionReference<'query'>>(
	client: Pick<ConvexClient, 'onPaginatedUpdate_experimental'>,
	query: Query,
	args: FunctionArgs<Query>,
	initialNumItems: number,
	onSnapshot: (snapshot: PaginatedSnapshot) => void,
	onError: (error: Error) => void
): () => void {
	let subscription: ReturnType<ConvexClient['onPaginatedUpdate_experimental']> | undefined;
	let failed = false;

	const read = () => {
		let current: PaginatedSnapshot | undefined;
		try {
			current = subscription?.getCurrentValue() as PaginatedSnapshot | undefined;
		} catch (error) {
			failed = true;
			onError(toError(error));
			return;
		}
		if (current) onSnapshot(current);
	};

	try {
		subscription = client.onPaginatedUpdate_experimental(
			query,
			args,
			{ initialNumItems },
			// A callback the client runs synchronously, before `subscription` is
			// assigned, is covered by the read below.
			() => {
				if (subscription) read();
			},
			(error: Error) => {
				failed = true;
				onError(error);
			}
		);
	} catch (error) {
		onError(toError(error));
		return () => {};
	}

	// Cached value of a query another subscriber already holds, or a snapshot
	// delivered synchronously while subscribing.
	if (!failed) read();

	return () => subscription?.();
}
