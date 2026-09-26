import { afterEach, describe, expect, it, vi } from 'vitest';

const { clientConstructed } = vi.hoisted(() => ({ clientConstructed: vi.fn() }));

vi.mock('convex/browser', () => ({
	ConvexClient: class {
		closed = false;
		constructor(url: string, options: unknown) {
			clientConstructed(url, options);
		}
		async close() {
			this.closed = true;
		}
	}
}));

import { initConvex } from './client.js';
import { closeConvex, getSingletonClient } from '../internal/singleton.js';
import { RouteQuery, _resetQueryLifecycle } from './query-lifecycle.js';

afterEach(async () => {
	await closeConvex();
	_resetQueryLifecycle();
	vi.clearAllMocks();
});

describe('initConvex', () => {
	it('is idempotent for the same URL', () => {
		const first = initConvex('https://example.convex.cloud');
		const second = initConvex('https://example.convex.cloud');

		expect(second).toBe(first);
		expect(getSingletonClient()).toBe(first);
	});

	it('throws when called with a different URL while a client exists', () => {
		const first = initConvex('https://a.convex.cloud');

		expect(() => initConvex('https://b.convex.cloud')).toThrow(
			'Only one deployment per app is supported'
		);
		// The original client stays intact.
		expect(getSingletonClient()).toBe(first);
	});

	it('accepts a different URL after closeConvex', async () => {
		const first = initConvex('https://a.convex.cloud');
		await closeConvex();

		const second = initConvex('https://b.convex.cloud');
		expect(second).not.toBe(first);
		expect(getSingletonClient()).toBe(second);
	});

	it('rejects an empty URL', () => {
		expect(() => initConvex('')).toThrow('initConvex requires a non-empty URL string');
	});
});

describe('initConvex — keepAlive', () => {
	/** Create a convexLoad-style query, let the route use it, then navigate away. */
	function releaseRouteQuery() {
		const handle = { open: vi.fn(), close: vi.fn() };
		const query = new RouteQuery(handle);
		query.setInRoute(true);
		query.setInRoute(false);
		return handle;
	}

	it('keeps released queries subscribed by default', () => {
		initConvex('https://example.convex.cloud');

		expect(releaseRouteQuery().close).not.toHaveBeenCalled();
	});

	it('keepAlive: false unsubscribes released queries immediately', () => {
		initConvex('https://example.convex.cloud', { keepAlive: false });

		expect(releaseRouteQuery().close).toHaveBeenCalledOnce();
	});

	it('a rejected call (different URL) does not change keepAlive', () => {
		initConvex('https://a.convex.cloud');

		expect(() => initConvex('https://b.convex.cloud', { keepAlive: false })).toThrow();
		expect(releaseRouteQuery().close).not.toHaveBeenCalled();
	});

	it('a repeated call with the same URL applies keepAlive (HMR)', () => {
		const first = initConvex('https://example.convex.cloud');
		const second = initConvex('https://example.convex.cloud', { keepAlive: false });

		expect(second).toBe(first);
		expect(releaseRouteQuery().close).toHaveBeenCalledOnce();
	});

	it('does not pass keepAlive on to the ConvexClient', () => {
		initConvex('https://example.convex.cloud', {
			keepAlive: { maxQueries: 3 },
			verbose: true
		});

		expect(clientConstructed).toHaveBeenCalledWith('https://example.convex.cloud', {
			disabled: true,
			verbose: true
		});
	});
});
