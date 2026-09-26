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

import { createDetachedQuery } from './query-detached.svelte.js';
import { createDetachedPaginatedQuery } from './paginated-query-detached.svelte.js';
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
