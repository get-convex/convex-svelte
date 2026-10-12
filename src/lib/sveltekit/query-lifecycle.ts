/**
 * Lifecycle of route-scoped detached queries (`convexLoad` / `convexLoadPaginated`).
 *
 * A route-scoped query stays subscribed while it is *in use*: reachable from
 * SvelteKit's `page.data` (all layouts + the current page) or read by at least
 * one effect. Once it is no longer in use it moves into a small idle buffer
 * (LRU, bounded by `maxIdleEntries` and `expiration`) so back navigation and
 * revisits stay instant. Queries leaving the buffer are unsubscribed and
 * resubscribe automatically when they are used again.
 *
 * The option names match convex-helpers' `ConvexQueryCacheProvider`. Unlike
 * it, a full buffer evicts the query that has been idle longest rather than
 * the one that just became idle: the page you just left is the likeliest one
 * to go back to.
 *
 * This module is framework-free so it can be unit tested. The Svelte and
 * SvelteKit glue (`page.data` watcher, reader tracking) lives in
 * `route-data.svelte.ts`.
 */
import { onCloseConvex } from '../internal/singleton.js';

/** Options for the idle buffer of queries created by `convexLoad()` / `convexLoadPaginated()`. */
export type QueryCacheOptions = {
	/**
	 * Maximum number of idle queries kept subscribed. When exceeded, the query
	 * that has been idle the longest is unsubscribed first. `0` unsubscribes
	 * queries as soon as they are no longer used.
	 * @default 10
	 */
	maxIdleEntries?: number;
	/**
	 * Maximum time in milliseconds an idle query stays subscribed.
	 * `Infinity` keeps idle queries until they are pushed out by `maxIdleEntries`.
	 * @default 60_000
	 */
	expiration?: number;
};

export const DEFAULT_QUERY_CACHE: Required<QueryCacheOptions> = {
	maxIdleEntries: 10,
	expiration: 60_000
};

/**
 * How long a query may exist without being claimed by the current route or a
 * reader — e.g. a hover preload the user never navigates to, or a load that
 * was superseded by another navigation. Such a query is closed instead of
 * taking a slot in the idle buffer. Matches the default of React's
 * `prewarmQuery()`. A late claim (a click after this) just resubscribes.
 */
export const UNCLAIMED_TIMEOUT_MS = 5_000;

/** Opens and closes the underlying Convex subscription. Both must be idempotent. */
export type SubscriptionHandle = {
	open(): void;
	close(): void;
};

let cacheConfig: Required<QueryCacheOptions> = { ...DEFAULT_QUERY_CACHE };

/** Idle queries in release order (oldest first), mapped to their close callback. */
const idleQueries = new Map<RouteQuery, () => void>();

/** Queries reachable from `page.data` at the last reconcile. */
let queriesInRoute = new Set<RouteQuery>();

/** Queries whose subscription is currently open. */
const openQueries = new Set<RouteQuery>();

// The queries are bound to the client being closed and can never update
// again, so dispose them — this also cancels their timers.
onCloseConvex(() => {
	for (const query of [...openQueries]) query.dispose();
});

/**
 * Configure the idle buffer. `false` disables it: queries are unsubscribed as
 * soon as they are no longer used by the current route.
 */
export function configureQueryCache(options: QueryCacheOptions | false): void {
	cacheConfig =
		options === false
			? { maxIdleEntries: 0, expiration: 0 }
			: {
					maxIdleEntries: Math.max(0, options.maxIdleEntries ?? DEFAULT_QUERY_CACHE.maxIdleEntries),
					expiration: Math.max(0, options.expiration ?? DEFAULT_QUERY_CACHE.expiration)
				};
	trimIdleQueries();
	// Queries already idle get the new expiration too, counted from now.
	for (const query of [...idleQueries.keys()]) query._restartIdleTimer();
}

/** Unsubscribe the longest-idle queries until the buffer fits `maxIdleEntries`. */
function trimIdleQueries(): void {
	for (const close of idleQueries.values()) {
		if (idleQueries.size <= cacheConfig.maxIdleEntries) return;
		close();
	}
}

type Phase = 'unclaimed' | 'active' | 'idle' | 'closed' | 'disposed';

/**
 * Tracks whether a single route-scoped query is in use and opens/closes its
 * subscription accordingly.
 */
export class RouteQuery {
	#phase: Phase = 'unclaimed';
	#readers = 0;
	#inRoute = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	readonly #handle: SubscriptionHandle;
	readonly #keepAlive: boolean;
	readonly #key: string | undefined;

	/**
	 * Opens the subscription immediately, so data starts flowing while the
	 * navigation is still in progress.
	 *
	 * @param handle - Opens/closes the underlying subscription.
	 * @param keepAlive - Whether this query may use the idle buffer.
	 * @param key - Identifies the query and its args. Once this query is
	 * claimed, idle queries with the same key are replaced by it instead of
	 * occupying buffer slots.
	 */
	constructor(handle: SubscriptionHandle, keepAlive = true, key?: string) {
		this.#handle = handle;
		this.#keepAlive = keepAlive;
		this.#key = key;
		this.#open();
		this.#startTimer(UNCLAIMED_TIMEOUT_MS, () => this.#close());
	}

	/** Current lifecycle phase. Exposed for tests and debugging. */
	get phase(): Phase {
		return this.#phase;
	}

	/**
	 * Keep an unclaimed query from timing out until `pending` settles, e.g.
	 * while its load awaits the first result (which may take long when offline).
	 */
	holdWhile(pending: Promise<unknown>): void {
		if (this.#phase !== 'unclaimed') return;
		this.#clearTimer();
		const restart = () => {
			if (this.#phase === 'unclaimed') {
				this.#startTimer(UNCLAIMED_TIMEOUT_MS, () => this.#close());
			}
		};
		pending.then(restart, restart);
	}

	/** An effect started reading this query. */
	retainReader(): void {
		this.#readers += 1;
		this.#activate();
	}

	/** An effect stopped reading this query. */
	releaseReader(): void {
		this.#readers = Math.max(0, this.#readers - 1);
		if (this.#readers === 0 && !this.#inRoute) this.#release();
	}

	/** Whether the query is reachable from the current `page.data`. */
	setInRoute(inRoute: boolean): void {
		if (inRoute) {
			this.#inRoute = true;
			this.#activate();
		} else if (this.#inRoute) {
			this.#inRoute = false;
			if (this.#readers === 0) this.#release();
		}
	}

	/** Unsubscribe permanently. The query never resubscribes after this. */
	dispose(): void {
		this.#close();
		this.#phase = 'disposed';
	}

	#activate(): void {
		if (this.#phase === 'disposed') return;
		this.#clearTimer();
		idleQueries.delete(this);
		if (this.#phase === 'closed') this.#open();
		this.#phase = 'active';
		this.#replaceIdleDuplicates();
	}

	/**
	 * Close idle copies of this query, now that it is in use. Only on claim: an
	 * unclaimed duplicate (e.g. a hover preload that is never clicked) must not
	 * evict the copy of a page the user visited. Runs after this query's
	 * subscription is open, so the Convex client keeps the shared subscription
	 * instead of removing and re-adding it.
	 */
	#replaceIdleDuplicates(): void {
		if (this.#key === undefined) return;
		for (const [query, close] of idleQueries) {
			if (query.#key === this.#key) close();
		}
	}

	/** No longer in use: move into the idle buffer, or close right away. */
	#release(): void {
		if (this.#phase !== 'unclaimed' && this.#phase !== 'active') return;
		this.#clearTimer();
		// An active copy (e.g. the replacement after invalidate(), claimed while
		// this one still had a reader) already holds the subscription.
		if (!this.#keepAlive || cacheConfig.maxIdleEntries === 0 || this.#hasActiveCopy()) {
			this.#close();
			return;
		}
		this.#phase = 'idle';
		idleQueries.set(this, () => this.#close());
		this.#scheduleExpiry();
		trimIdleQueries();
	}

	/**
	 * Restart the idle timer with the current `expiration`, after
	 * `configureQueryCache()` changed it.
	 * @internal
	 */
	_restartIdleTimer(): void {
		if (this.#phase === 'idle') this.#scheduleExpiry();
	}

	#scheduleExpiry(): void {
		this.#clearTimer();
		if (Number.isFinite(cacheConfig.expiration)) {
			this.#startTimer(cacheConfig.expiration, () => this.#close());
		}
	}

	#hasActiveCopy(): boolean {
		if (this.#key === undefined) return false;
		for (const query of openQueries) {
			if (query !== this && query.#key === this.#key && query.#phase === 'active') return true;
		}
		return false;
	}

	#close(): void {
		if (this.#phase === 'closed' || this.#phase === 'disposed') return;
		this.#clearTimer();
		idleQueries.delete(this);
		queriesInRoute.delete(this);
		this.#inRoute = false;
		this.#phase = 'closed';
		openQueries.delete(this);
		this.#handle.close();
	}

	#open(): void {
		openQueries.add(this);
		this.#handle.open();
	}

	#startTimer(ms: number, fn: () => void): void {
		this.#timer = setTimeout(fn, ms);
	}

	#clearTimer(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}
}

const ROUTE_QUERY = Symbol('convex-svelte.routeQuery');

/**
 * Brand a detached query result so `page.data` reconciliation can find it
 * without invoking its (reader-tracking) getters.
 */
export function markRouteQuery<T extends object>(result: T, query: RouteQuery): T {
	Object.defineProperty(result, ROUTE_QUERY, { value: query });
	return result;
}

/**
 * Collect all route-scoped queries reachable from load data. Follows plain
 * objects, arrays, Maps and Sets; only reads data properties so user getters
 * are never invoked.
 */
export function collectRouteQueries(
	value: unknown,
	found = new Set<RouteQuery>(),
	seen = new Set<object>()
): Set<RouteQuery> {
	if (typeof value !== 'object' || value === null || seen.has(value)) return found;
	seen.add(value);

	const query = (value as { [ROUTE_QUERY]?: RouteQuery })[ROUTE_QUERY];
	if (query) {
		found.add(query);
		return found;
	}

	if (Array.isArray(value) || value instanceof Set) {
		for (const item of value) collectRouteQueries(item, found, seen);
	} else if (value instanceof Map) {
		for (const item of value.values()) collectRouteQueries(item, found, seen);
	} else if (isPlainObject(value)) {
		for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
			if ('value' in descriptor) collectRouteQueries(descriptor.value, found, seen);
		}
	}
	return found;
}

function isPlainObject(value: object): boolean {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Mark queries reachable from `data` as in use and release the ones that
 * dropped out since the last call. Called whenever `page.data` changes.
 */
export function reconcileRouteQueries(data: unknown): void {
	const reachable = collectRouteQueries(data);
	const previous = queriesInRoute;
	queriesInRoute = reachable;
	for (const query of previous) {
		if (!reachable.has(query)) query.setInRoute(false);
	}
	for (const query of reachable) query.setInRoute(true);
}

/** Reset module state. Tests only. */
export function _resetQueryLifecycle(): void {
	for (const query of [...openQueries]) query.dispose();
	queriesInRoute = new Set();
	cacheConfig = { ...DEFAULT_QUERY_CACHE };
}
