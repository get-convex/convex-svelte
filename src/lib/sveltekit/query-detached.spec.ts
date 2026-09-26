import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FunctionReference } from 'convex/server';

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
	deferSubscription: (fn: () => void) => deferred.push(fn)
}));

// The real module needs SvelteKit's `$app/state`; reader tracking is a no-op here.
vi.mock('./route-data.svelte.js', async () => {
	const { RouteQuery } = await import('./query-lifecycle.js');
	return {
		createRouteQuery: (
			handle: ConstructorParameters<typeof RouteQuery>[0],
			keepAlive: boolean
		) => ({
			query: new RouteQuery(handle, keepAlive),
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

const ref = { _name: 'messages:list' } as unknown as FunctionReference<'query'>;

beforeEach(() => {
	vi.clearAllMocks();
	deferred.length = 0;
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
