import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFunctionReference } from 'convex/server';

// ---------------------------------------------------------------------------
// Tests for createDetachedQuery / createDetachedPaginatedQuery subscription
// handling (issue #57): the unsubscribe returned by the Convex client must be
// kept, and releasing must work even before the deferred subscribe ran.
// ---------------------------------------------------------------------------

const { client, deferred, flush } = vi.hoisted(() => {
	const deferred: Array<() => void> = [];
	const client = {
		closed: false,
		disabled: false,
		unsubscribe: vi.fn(),
		onUpdate: vi.fn(),
		onPaginatedUpdate_experimental: vi.fn()
	};
	return {
		client,
		deferred,
		flush: () => {
			for (const fn of deferred.splice(0)) fn();
		}
	};
});

vi.mock('../internal/singleton.js', () => ({
	getConvexClient: () => client,
	deferSubscription: (fn: () => void) => deferred.push(fn),
	onCloseConvex: () => {}
}));

// The real module needs SvelteKit's `$app/state`; reader tracking is a no-op here.
vi.mock('./route-data.svelte.js', async () => {
	const { RouteQuery } = await import('./query-lifecycle.js');
	return {
		createRouteQuery: (
			handle: ConstructorParameters<typeof RouteQuery>[0],
			keepAlive: boolean,
			key: string
		) => ({
			query: new RouteQuery(handle, keepAlive, key),
			track: () => {}
		})
	};
});

import { createDetachedQuery, openDetachedQuery } from './query-detached.svelte.js';
import {
	createDetachedPaginatedQuery,
	openDetachedPaginatedQuery
} from './paginated-query-detached.svelte.js';
import {
	_resetQueryLifecycle,
	configureKeepAlive,
	reconcileRouteQueries
} from './query-lifecycle.js';

const ref = makeFunctionReference<'query'>('messages:list');

beforeEach(() => {
	vi.clearAllMocks();
	deferred.length = 0;
	client.disabled = false;
	client.onUpdate.mockReturnValue(client.unsubscribe);
	client.onPaginatedUpdate_experimental.mockReturnValue(
		Object.assign(client.unsubscribe, { getCurrentValue: () => undefined })
	);
});

afterEach(() => {
	_resetQueryLifecycle();
});

describe('createDetachedQuery — manual scope', () => {
	it('subscribes after the deferred flush', () => {
		createDetachedQuery(ref, {}, []);
		expect(client.onUpdate).not.toHaveBeenCalled();

		flush();

		expect(client.onUpdate).toHaveBeenCalledOnce();
	});

	it('dispose() unsubscribes and marks the data as stale', () => {
		const result = createDetachedQuery(ref, {}, []);
		flush();

		result.dispose();

		expect(client.unsubscribe).toHaveBeenCalledOnce();
		expect(result.isStale).toBe(true);
	});

	it('dispose() before the deferred subscribe prevents subscribing', () => {
		const result = createDetachedQuery(ref, {}, []);

		result.dispose();
		flush();

		expect(client.onUpdate).not.toHaveBeenCalled();
		expect(result.isStale).toBe(false);
	});

	it('stays subscribed without dispose()', () => {
		createDetachedQuery(ref, {}, []);
		flush();
		reconcileRouteQueries({});

		expect(client.unsubscribe).not.toHaveBeenCalled();
	});
});

describe('createDetachedQuery — route scope', () => {
	it('unsubscribes when the route no longer uses it (keepAlive disabled)', () => {
		configureKeepAlive(false);
		const result = createDetachedQuery(ref, {}, [], { scope: 'route' });
		flush();
		reconcileRouteQueries({ messages: result });

		reconcileRouteQueries({});

		expect(client.unsubscribe).toHaveBeenCalledOnce();
		expect(result.isStale).toBe(true);
	});

	it('keeps the subscription in the idle buffer by default', () => {
		const result = createDetachedQuery(ref, {}, [], { scope: 'route' });
		flush();
		reconcileRouteQueries({ messages: result });

		reconcileRouteQueries({});

		expect(client.unsubscribe).not.toHaveBeenCalled();
	});

	it('respects keepAlive: false per query', () => {
		const result = createDetachedQuery(ref, {}, [], { scope: 'route', keepAlive: false });
		flush();
		reconcileRouteQueries({ messages: result });

		reconcileRouteQueries({});

		expect(client.unsubscribe).toHaveBeenCalledOnce();
	});

	it('does not subscribe when released before the deferred subscribe ran', () => {
		const result = createDetachedQuery(ref, {}, [], { scope: 'route', keepAlive: false });
		reconcileRouteQueries({ messages: result });
		reconcileRouteQueries({});

		flush();

		expect(client.onUpdate).not.toHaveBeenCalled();
	});

	it('resubscribes once when used again after release', () => {
		configureKeepAlive(false);
		const result = createDetachedQuery(ref, {}, [], { scope: 'route' });
		flush();
		reconcileRouteQueries({ messages: result });
		reconcileRouteQueries({});

		reconcileRouteQueries({ messages: result });
		flush();

		expect(client.onUpdate).toHaveBeenCalledTimes(2);
	});

	it('clears isStale when the resubscribed query receives data', () => {
		configureKeepAlive(false);
		const result = createDetachedQuery(ref, {}, [], { scope: 'route' });
		flush();
		reconcileRouteQueries({ messages: result });
		reconcileRouteQueries({});
		expect(result.isStale).toBe(true);

		reconcileRouteQueries({ messages: result });
		flush();
		const onResult = client.onUpdate.mock.calls[1][2] as (value: unknown) => void;
		onResult(['fresh']);

		expect(result.isStale).toBe(false);
		expect(result.data).toEqual(['fresh']);
	});
});

describe('createDetachedPaginatedQuery', () => {
	it('dispose() unsubscribes (manual scope)', () => {
		const result = createDetachedPaginatedQuery(ref, {}, { initialNumItems: 10 });
		flush();

		result.dispose();

		expect(client.onPaginatedUpdate_experimental).toHaveBeenCalledOnce();
		expect(client.unsubscribe).toHaveBeenCalledOnce();
	});

	it('unsubscribes when the route no longer uses it (keepAlive disabled)', () => {
		configureKeepAlive(false);
		const result = createDetachedPaginatedQuery(ref, {}, { initialNumItems: 10, scope: 'route' });
		flush();
		reconcileRouteQueries({ messages: result });

		reconcileRouteQueries({});

		expect(client.unsubscribe).toHaveBeenCalledOnce();
	});
});

describe('inactive (SSR / closed) clients', () => {
	it('createDetachedQuery does not queue a deferred subscription', () => {
		client.disabled = true;

		const manual = createDetachedQuery(ref, {}, []);
		const route = createDetachedQuery(ref, {}, [], { scope: 'route' });

		// The server never flushes the queue, so queued callbacks would leak.
		expect(deferred).toHaveLength(0);
		expect(manual.data).toEqual([]);
		expect(route.data).toEqual([]);
	});

	it('createDetachedPaginatedQuery does not queue a deferred subscription', () => {
		client.disabled = true;

		createDetachedPaginatedQuery(ref, {}, { initialNumItems: 10 });
		createDetachedPaginatedQuery(ref, {}, { initialNumItems: 10, scope: 'route' });

		expect(deferred).toHaveLength(0);
	});
});

describe('createDetachedPaginatedQuery — loadMore after release', () => {
	/** Deliver a first page so the result's loadMore is wired to the subscription. */
	function deliverPage(subscriptionLoadMore: (numItems: number) => boolean) {
		const subscription = Object.assign(vi.fn(), {
			getCurrentValue: () => ({
				results: [{ id: 1 }],
				status: 'CanLoadMore' as const,
				loadMore: subscriptionLoadMore
			})
		});
		client.onPaginatedUpdate_experimental.mockReturnValueOnce(subscription);
		flush();
	}

	it('forwards loadMore while subscribed', () => {
		const subscriptionLoadMore = vi.fn(() => true);
		const result = createDetachedPaginatedQuery(ref, {}, { initialNumItems: 10 });
		deliverPage(subscriptionLoadMore);

		expect(result.loadMore(10)).toBe(true);
		expect(subscriptionLoadMore).toHaveBeenCalledWith(10);
	});

	it('returns false and does not touch the closed subscription after dispose()', () => {
		// Convex identifies paginated queries by args: calling the old loadMore
		// would throw or load pages into a newer subscription with the same args.
		const subscriptionLoadMore = vi.fn(() => true);
		const result = createDetachedPaginatedQuery(ref, {}, { initialNumItems: 10 });
		deliverPage(subscriptionLoadMore);

		result.dispose();

		expect(result.loadMore(10)).toBe(false);
		expect(subscriptionLoadMore).not.toHaveBeenCalled();
		expect(result.status).toBe('CanLoadMore');
	});

	it('queues loadMore while released and sends it to the new subscription', () => {
		configureKeepAlive(false);
		const oldLoadMore = vi.fn(() => true);
		const newLoadMore = vi.fn(() => true);
		const result = createDetachedPaginatedQuery(ref, {}, { initialNumItems: 10, scope: 'route' });
		deliverPage(oldLoadMore);
		reconcileRouteQueries({ messages: result });
		reconcileRouteQueries({});

		result.loadMore(10);
		reconcileRouteQueries({ messages: result });
		deliverPage(newLoadMore);

		expect(oldLoadMore).not.toHaveBeenCalled();
		expect(newLoadMore).toHaveBeenCalledWith(10);
	});
});

describe('route scope — idle duplicates', () => {
	it('replaces an idle query with the same args instead of keeping both', () => {
		const first = createDetachedQuery(ref, { muteWords: ['a'] }, [], { scope: 'route' });
		flush();
		reconcileRouteQueries({ messages: first });
		reconcileRouteQueries({});
		const firstUnsubscribe = client.unsubscribe;
		const secondUnsubscribe = vi.fn();
		client.onUpdate.mockReturnValueOnce(secondUnsubscribe);

		// Revisit: the load creates a new result for the same query and args.
		createDetachedQuery(ref, { muteWords: ['a'] }, [], { scope: 'route' });
		flush();

		expect(client.onUpdate).toHaveBeenCalledTimes(2);
		expect(firstUnsubscribe).toHaveBeenCalledOnce();
		expect(secondUnsubscribe).not.toHaveBeenCalled();
	});

	it('keeps idle queries with different args', () => {
		const first = createDetachedQuery(ref, { muteWords: ['a'] }, [], { scope: 'route' });
		flush();
		reconcileRouteQueries({ messages: first });
		reconcileRouteQueries({});

		createDetachedQuery(ref, { muteWords: ['b'] }, [], { scope: 'route' });
		flush();

		expect(client.unsubscribe).not.toHaveBeenCalled();
	});
});

/** Whether a promise settles once all pending microtasks have run. */
async function settledState(
	promise: Promise<unknown>
): Promise<'pending' | 'resolved' | 'rejected'> {
	let state: 'pending' | 'resolved' | 'rejected' = 'pending';
	promise.then(
		() => (state = 'resolved'),
		() => (state = 'rejected')
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	return state;
}

describe('openDetachedQuery — immediate subscription with first value (convexLoad)', () => {
	/** The value/error callbacks of the n-th onUpdate call. */
	function callbacks(call = 0) {
		const [, , onResult, onError] = client.onUpdate.mock.calls[call] as [
			unknown,
			unknown,
			(value: unknown) => void,
			(error: Error) => void
		];
		return { onResult, onError };
	}

	it('subscribes synchronously, bypassing the deferred queue', () => {
		openDetachedQuery(ref, {}, undefined, { scope: 'route', immediate: true });

		expect(client.onUpdate).toHaveBeenCalledOnce();
		expect(deferred).toHaveLength(0);
	});

	it('resolves with the first result and exposes it as data', async () => {
		const { result, firstValue } = openDetachedQuery(ref, {}, undefined, {
			scope: 'route',
			immediate: true
		});
		expect(await settledState(firstValue)).toBe('pending');
		expect(result.isLoading).toBe(true);

		callbacks().onResult(['first']);

		expect(await settledState(firstValue)).toBe('resolved');
		expect(result.data).toEqual(['first']);
		expect(result.isLoading).toBe(false);
	});

	it('uses an already available value right away (revisiting a live query)', async () => {
		client.onUpdate.mockReturnValueOnce(
			Object.assign(vi.fn(), { getCurrentValue: () => ['cached'] })
		);

		const { result, firstValue } = openDetachedQuery(ref, {}, undefined, {
			scope: 'route',
			immediate: true
		});

		expect(result.data).toEqual(['cached']);
		expect(await settledState(firstValue)).toBe('resolved');
	});

	it('rejects with the query error', async () => {
		const { result, firstValue } = openDetachedQuery(ref, {}, undefined, {
			scope: 'route',
			immediate: true
		});

		callbacks().onError(new Error('boom'));

		await expect(firstValue).rejects.toThrow('boom');
		expect(result.error?.message).toBe('boom');
	});

	it('rejects with a cached error thrown by getCurrentValue', async () => {
		client.onUpdate.mockReturnValueOnce(
			Object.assign(vi.fn(), {
				getCurrentValue: () => {
					throw new Error('cached error');
				}
			})
		);

		const { firstValue } = openDetachedQuery(ref, {}, undefined, {
			scope: 'route',
			immediate: true
		});

		await expect(firstValue).rejects.toThrow('cached error');
	});

	it('rejects when disposed before the first result', async () => {
		const { result, firstValue } = openDetachedQuery(ref, {}, undefined, {
			scope: 'route',
			immediate: true
		});

		result.dispose();

		await expect(firstValue).rejects.toThrow('disposed before its first result');
	});

	it('rejects right away for an inactive client instead of hanging', async () => {
		client.disabled = true;

		const { firstValue } = openDetachedQuery(ref, {}, undefined, {
			scope: 'route',
			immediate: true
		});

		await expect(firstValue).rejects.toThrow('disabled or closed');
		expect(client.onUpdate).not.toHaveBeenCalled();
	});

	it('keeps later results flowing after the first one', () => {
		const { result } = openDetachedQuery(ref, {}, undefined, { scope: 'route', immediate: true });

		callbacks().onResult(['first']);
		callbacks().onResult(['second']);

		expect(result.data).toEqual(['second']);
	});

	it('resubscribes through the deferred queue after a release (only the first open is immediate)', () => {
		configureKeepAlive(false);
		const { result } = openDetachedQuery(ref, {}, undefined, { scope: 'route', immediate: true });
		callbacks().onResult(['first']);
		reconcileRouteQueries({ messages: result });
		reconcileRouteQueries({});

		reconcileRouteQueries({ messages: result });

		expect(client.onUpdate).toHaveBeenCalledOnce();
		flush();
		expect(client.onUpdate).toHaveBeenCalledTimes(2);
	});

	it('createDetachedQuery keeps the deferred subscription (transport / hydration path)', () => {
		createDetachedQuery(ref, {}, ['ssr'], { scope: 'route' });

		expect(client.onUpdate).not.toHaveBeenCalled();
		flush();
		expect(client.onUpdate).toHaveBeenCalledOnce();
	});
});

describe('openDetachedPaginatedQuery — immediate subscription with first page', () => {
	function paginatedCallbacks(call = 0) {
		const [, , , onUpdate, onError] = client.onPaginatedUpdate_experimental.mock.calls[call] as [
			unknown,
			unknown,
			unknown,
			() => void,
			(error: Error) => void
		];
		return { onUpdate, onError };
	}

	/** A subscription whose current value can be set by the test. */
	function paginatedSubscription() {
		let current: { results: unknown[]; status: 'CanLoadMore'; loadMore: () => boolean } | undefined;
		const subscription = Object.assign(vi.fn(), { getCurrentValue: () => current });
		client.onPaginatedUpdate_experimental.mockReturnValueOnce(subscription);
		return {
			deliver(results: unknown[]) {
				current = { results, status: 'CanLoadMore', loadMore: () => true };
			}
		};
	}

	it('subscribes synchronously and resolves with the first page', async () => {
		const subscription = paginatedSubscription();
		const { result, firstValue } = openDetachedPaginatedQuery(
			ref,
			{},
			{
				initialNumItems: 10,
				scope: 'route',
				immediate: true
			}
		);
		expect(deferred).toHaveLength(0);
		expect(await settledState(firstValue)).toBe('pending');

		subscription.deliver([{ id: 1 }]);
		paginatedCallbacks().onUpdate();

		expect(await settledState(firstValue)).toBe('resolved');
		expect(result.results).toEqual([{ id: 1 }]);
		expect(result.isLoading).toBe(false);
	});

	it('uses an already available first page right away', async () => {
		const subscription = paginatedSubscription();
		subscription.deliver([{ id: 'cached' }]);

		const { result, firstValue } = openDetachedPaginatedQuery(
			ref,
			{},
			{
				initialNumItems: 10,
				scope: 'route',
				immediate: true
			}
		);

		expect(result.results).toEqual([{ id: 'cached' }]);
		expect(await settledState(firstValue)).toBe('resolved');
	});

	it('rejects with the query error', async () => {
		paginatedSubscription();
		const { firstValue } = openDetachedPaginatedQuery(
			ref,
			{},
			{
				initialNumItems: 10,
				scope: 'route',
				immediate: true
			}
		);

		paginatedCallbacks().onError(new Error('boom'));

		await expect(firstValue).rejects.toThrow('boom');
	});

	it('rejects when disposed before the first page', async () => {
		paginatedSubscription();
		const { result, firstValue } = openDetachedPaginatedQuery(
			ref,
			{},
			{
				initialNumItems: 10,
				scope: 'route',
				immediate: true
			}
		);

		result.dispose();

		await expect(firstValue).rejects.toThrow('disposed before its first result');
	});

	it('rejects right away for an inactive client', async () => {
		client.disabled = true;

		const { firstValue } = openDetachedPaginatedQuery(
			ref,
			{},
			{
				initialNumItems: 10,
				scope: 'route',
				immediate: true
			}
		);

		await expect(firstValue).rejects.toThrow('disabled or closed');
	});
});
