import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	RouteQuery,
	UNCLAIMED_TIMEOUT_MS,
	DEFAULT_KEEP_ALIVE,
	_resetQueryLifecycle,
	collectRouteQueries,
	configureKeepAlive,
	markRouteQuery,
	reconcileRouteQueries
} from './query-lifecycle.js';

// ---------------------------------------------------------------------------
// Tests for the route-scoped query lifecycle used by convexLoad /
// convexLoadPaginated (issue #57: detached queries never unsubscribed).
//
// A route-scoped query stays subscribed while it is reachable from
// `page.data` or read by an effect. After that it sits in an idle LRU buffer
// (maxQueries / maxIdleMs) and is unsubscribed when it falls out.
// ---------------------------------------------------------------------------

/** A handle that records how often the subscription was opened and closed. */
function createHandle() {
	const handle = {
		isOpen: false,
		opens: 0,
		closes: 0,
		open: vi.fn(() => {
			handle.isOpen = true;
			handle.opens += 1;
		}),
		close: vi.fn(() => {
			handle.isOpen = false;
			handle.closes += 1;
		})
	};
	return handle;
}

/** A route-scoped query plus the load-result object that references it. */
function createQuery(keepAlive = true) {
	const handle = createHandle();
	const query = new RouteQuery(handle, keepAlive);
	const result = markRouteQuery({ data: undefined }, query);
	return { handle, query, result };
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	_resetQueryLifecycle();
	vi.useRealTimers();
});

describe('RouteQuery — route reconciliation', () => {
	it('subscribes immediately on creation', () => {
		const { handle, query } = createQuery();

		expect(handle.isOpen).toBe(true);
		expect(query.phase).toBe('unclaimed');
	});

	it('stays subscribed while reachable from page.data', () => {
		const { handle, query, result } = createQuery();

		reconcileRouteQueries({ doc: result });
		vi.advanceTimersByTime(10 * 60_000);

		expect(query.phase).toBe('active');
		expect(handle.isOpen).toBe(true);
	});

	it('moves to the idle buffer when the route no longer uses it', () => {
		const { handle, query, result } = createQuery();
		reconcileRouteQueries({ doc: result });

		reconcileRouteQueries({});

		expect(query.phase).toBe('idle');
		expect(handle.isOpen).toBe(true);
	});

	it('reuses an idle subscription on revisit without resubscribing', () => {
		const { handle, query, result } = createQuery();
		reconcileRouteQueries({ doc: result });
		reconcileRouteQueries({});

		reconcileRouteQueries({ doc: result });

		expect(query.phase).toBe('active');
		expect(handle.opens).toBe(1);
		expect(handle.closes).toBe(0);
	});

	it('keeps layout queries alive across child navigations', () => {
		const layout = createQuery();
		const pageA = createQuery();
		const pageB = createQuery();

		reconcileRouteQueries({ user: layout.result, doc: pageA.result });
		reconcileRouteQueries({ user: layout.result, doc: pageB.result });

		expect(layout.query.phase).toBe('active');
		expect(pageA.query.phase).toBe('idle');
		expect(pageB.query.phase).toBe('active');
	});

	it('does not release queries that were never claimed (navigation still in progress)', () => {
		const current = createQuery();
		reconcileRouteQueries({ doc: current.result });

		// The next route's load created this query; page.data is not updated yet.
		const next = createQuery();
		reconcileRouteQueries({ doc: current.result });

		expect(next.query.phase).toBe('unclaimed');
		expect(next.handle.isOpen).toBe(true);
	});

	it('resubscribes a closed query that becomes reachable again', () => {
		configureKeepAlive(false);
		const { handle, query, result } = createQuery();
		reconcileRouteQueries({ doc: result });
		reconcileRouteQueries({});
		expect(handle.isOpen).toBe(false);

		reconcileRouteQueries({ doc: result });

		expect(query.phase).toBe('active');
		expect(handle.isOpen).toBe(true);
		expect(handle.opens).toBe(2);
	});
});

describe('RouteQuery — idle buffer (keepAlive)', () => {
	it('uses 10 queries / 60s as defaults', () => {
		expect(DEFAULT_KEEP_ALIVE).toEqual({ maxQueries: 10, maxIdleMs: 60_000 });
	});

	it('unsubscribes the longest-idle query when maxQueries is exceeded', () => {
		configureKeepAlive({ maxQueries: 2 });
		const a = createQuery();
		const b = createQuery();
		const c = createQuery();

		reconcileRouteQueries({ doc: a.result });
		reconcileRouteQueries({ doc: b.result });
		reconcileRouteQueries({ doc: c.result });
		reconcileRouteQueries({});

		expect(a.handle.isOpen).toBe(false);
		expect(a.query.phase).toBe('closed');
		expect(b.handle.isOpen).toBe(true);
		expect(c.handle.isOpen).toBe(true);
	});

	it('refreshes LRU order when an idle query is used again', () => {
		configureKeepAlive({ maxQueries: 2 });
		const a = createQuery();
		const b = createQuery();
		const c = createQuery();

		reconcileRouteQueries({ doc: a.result });
		reconcileRouteQueries({ doc: b.result }); // idle: [a]
		reconcileRouteQueries({ doc: a.result }); // idle: [b]
		reconcileRouteQueries({ doc: c.result }); // idle: [b, a]
		reconcileRouteQueries({}); // idle: [b, a, c] → b evicted

		expect(b.handle.isOpen).toBe(false);
		expect(a.handle.isOpen).toBe(true);
		expect(c.handle.isOpen).toBe(true);
	});

	it('unsubscribes idle queries after maxIdleMs', () => {
		configureKeepAlive({ maxIdleMs: 5_000 });
		const { handle, result } = createQuery();
		reconcileRouteQueries({ doc: result });
		reconcileRouteQueries({});

		vi.advanceTimersByTime(4_999);
		expect(handle.isOpen).toBe(true);

		vi.advanceTimersByTime(1);
		expect(handle.isOpen).toBe(false);
	});

	it('keeps idle queries without a time limit when maxIdleMs is Infinity', () => {
		configureKeepAlive({ maxIdleMs: Infinity });
		const { handle, result } = createQuery();
		reconcileRouteQueries({ doc: result });
		reconcileRouteQueries({});

		vi.advanceTimersByTime(24 * 60 * 60_000);

		expect(handle.isOpen).toBe(true);
	});

	it('unsubscribes immediately when keepAlive is disabled globally', () => {
		configureKeepAlive(false);
		const { handle, query, result } = createQuery();
		reconcileRouteQueries({ doc: result });

		reconcileRouteQueries({});

		expect(query.phase).toBe('closed');
		expect(handle.isOpen).toBe(false);
	});

	it('unsubscribes immediately when keepAlive is disabled for the query', () => {
		const { handle, result } = createQuery(false);
		reconcileRouteQueries({ doc: result });

		reconcileRouteQueries({});

		expect(handle.isOpen).toBe(false);
	});

	it('trims already idle queries when the buffer shrinks', () => {
		const a = createQuery();
		const b = createQuery();
		reconcileRouteQueries({ a: a.result, b: b.result });
		reconcileRouteQueries({});

		configureKeepAlive({ maxQueries: 1 });

		expect(a.handle.isOpen).toBe(false);
		expect(b.handle.isOpen).toBe(true);
	});
});

describe('RouteQuery — unclaimed queries (preloads, superseded loads)', () => {
	it('releases a query that is never claimed after UNCLAIMED_TIMEOUT_MS', () => {
		configureKeepAlive(false);
		const { handle } = createQuery();

		vi.advanceTimersByTime(UNCLAIMED_TIMEOUT_MS - 1);
		expect(handle.isOpen).toBe(true);

		vi.advanceTimersByTime(1);
		expect(handle.isOpen).toBe(false);
	});

	it('moves an unclaimed query into the idle buffer when keepAlive is enabled', () => {
		const { query } = createQuery();

		vi.advanceTimersByTime(UNCLAIMED_TIMEOUT_MS);

		expect(query.phase).toBe('idle');
	});

	it('does not time out once the route claims the query', () => {
		const { handle, result } = createQuery();
		reconcileRouteQueries({ doc: result });

		vi.advanceTimersByTime(UNCLAIMED_TIMEOUT_MS * 10);

		expect(handle.isOpen).toBe(true);
	});
});

describe('RouteQuery — readers', () => {
	it('stays subscribed while an effect reads it, even when not in page.data', () => {
		// e.g. a layout query shadowed by a page key with the same name
		configureKeepAlive(false);
		const { handle, query, result } = createQuery();
		reconcileRouteQueries({ doc: result });
		query.retainReader();

		reconcileRouteQueries({});

		expect(query.phase).toBe('active');
		expect(handle.isOpen).toBe(true);

		query.releaseReader();
		expect(handle.isOpen).toBe(false);
	});

	it('stays subscribed while in page.data after the last reader stops', () => {
		const { handle, query, result } = createQuery();
		reconcileRouteQueries({ doc: result });
		query.retainReader();

		query.releaseReader();

		expect(query.phase).toBe('active');
		expect(handle.isOpen).toBe(true);
	});

	it('claims an unclaimed query (e.g. a streamed promise rendered by {#await})', () => {
		const { query } = createQuery();

		query.retainReader();
		vi.advanceTimersByTime(UNCLAIMED_TIMEOUT_MS * 10);

		expect(query.phase).toBe('active');
	});

	it('resubscribes a closed query when it is read again', () => {
		configureKeepAlive(false);
		const { handle, query, result } = createQuery();
		reconcileRouteQueries({ doc: result });
		reconcileRouteQueries({});
		expect(handle.isOpen).toBe(false);

		query.retainReader();

		expect(handle.isOpen).toBe(true);
		expect(handle.opens).toBe(2);
	});

	it('counts multiple readers', () => {
		configureKeepAlive(false);
		const { handle, query } = createQuery();
		query.retainReader();
		query.retainReader();

		query.releaseReader();
		expect(handle.isOpen).toBe(true);

		query.releaseReader();
		expect(handle.isOpen).toBe(false);
	});
});

describe('RouteQuery — dispose', () => {
	it('unsubscribes and never resubscribes', () => {
		const { handle, query, result } = createQuery();
		reconcileRouteQueries({ doc: result });

		query.dispose();
		reconcileRouteQueries({ doc: result });
		query.retainReader();

		expect(query.phase).toBe('disposed');
		expect(handle.isOpen).toBe(false);
		expect(handle.opens).toBe(1);
	});

	it('is safe to call multiple times', () => {
		const { handle, query } = createQuery();

		query.dispose();
		query.dispose();

		expect(handle.closes).toBe(1);
	});
});

describe('collectRouteQueries', () => {
	it('finds queries in nested objects, arrays, Maps and Sets', () => {
		const a = createQuery();
		const b = createQuery();
		const c = createQuery();
		const d = createQuery();

		const found = collectRouteQueries({
			nested: { deeper: { a: a.result } },
			list: [b.result],
			map: new Map([['c', c.result]]),
			set: new Set([d.result])
		});

		expect(found).toEqual(new Set([a.query, b.query, c.query, d.query]));
	});

	it('does not invoke getters', () => {
		const getter = vi.fn(() => 'value');
		const data = Object.defineProperty({}, 'lazy', { get: getter, enumerable: true });

		collectRouteQueries(data);

		expect(getter).not.toHaveBeenCalled();
	});

	it('does not traverse class instances', () => {
		const { result } = createQuery();
		class Holder {
			constructor(readonly inner: unknown) {}
		}

		expect(collectRouteQueries({ holder: new Holder(result) }).size).toBe(0);
	});

	it('handles cycles', () => {
		const { query, result } = createQuery();
		const data: Record<string, unknown> = { doc: result };
		data.self = data;

		expect(collectRouteQueries(data)).toEqual(new Set([query]));
	});

	it('ignores primitives and nullish values', () => {
		expect(collectRouteQueries(null).size).toBe(0);
		expect(collectRouteQueries(undefined).size).toBe(0);
		expect(collectRouteQueries('text').size).toBe(0);
		expect(collectRouteQueries({ n: 1, s: 'x', nil: null }).size).toBe(0);
	});
});
