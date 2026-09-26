/**
 * Lifecycle of route-scoped detached queries (`convexLoad` / `convexLoadPaginated`).
 *
 * A route-scoped query stays subscribed while it is *in use*: reachable from
 * SvelteKit's `page.data` (all layouts + the current page) or read by at least
 * one effect. Once it is no longer in use it moves into a small idle buffer
 * (LRU, bounded by `maxQueries` and `maxIdleMs`) so back navigation and
 * revisits stay instant. Queries leaving the buffer are unsubscribed and
 * resubscribe automatically when they are used again.
 *
 * This module is framework-free so it can be unit tested. The Svelte and
 * SvelteKit glue (`page.data` watcher, reader tracking) lives in
 * `route-data.svelte.ts`.
 */
import { onCloseConvex } from '../internal/singleton.js';

/** Options for the idle buffer of queries created by `convexLoad()` / `convexLoadPaginated()`. */
export type KeepAliveOptions = {
	/**
	 * Maximum number of idle queries kept subscribed. When exceeded, the query
	 * that has been idle the longest is unsubscribed first. `0` unsubscribes
	 * queries as soon as they are no longer used.
	 * @default 10
	 */
	maxQueries?: number;
	/**
	 * Maximum time in milliseconds an idle query stays subscribed.
	 * `Infinity` keeps idle queries until they are pushed out by `maxQueries`.
	 * @default 60_000
	 */
	maxIdleMs?: number;
};

export const DEFAULT_KEEP_ALIVE: Required<KeepAliveOptions> = {
	maxQueries: 10,
	maxIdleMs: 60_000
};

/**
 * How long a query may exist without being claimed by the current route or a
 * reader — e.g. a hover preload the user never navigates to, or a load that
 * was superseded by another navigation.
 */
export const UNCLAIMED_TIMEOUT_MS = 30_000;

/** Opens and closes the underlying Convex subscription. Both must be idempotent. */
export type SubscriptionHandle = {
	open(): void;
	close(): void;
};

let keepAliveConfig: Required<KeepAliveOptions> = { ...DEFAULT_KEEP_ALIVE };

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
export function configureKeepAlive(options: KeepAliveOptions | false): void {
	keepAliveConfig =
		options === false
			? { maxQueries: 0, maxIdleMs: 0 }
			: {
					maxQueries: Math.max(0, options.maxQueries ?? DEFAULT_KEEP_ALIVE.maxQueries),
					maxIdleMs: Math.max(0, options.maxIdleMs ?? DEFAULT_KEEP_ALIVE.maxIdleMs)
				};
	trimIdleQueries();
}

/** Unsubscribe the longest-idle queries until the buffer fits `maxQueries`. */
function trimIdleQueries(): void {
	for (const close of idleQueries.values()) {
		if (idleQueries.size <= keepAliveConfig.maxQueries) return;
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
	 * @param key - Identifies the query and its args. Idle queries with the
	 * same key are replaced by this one instead of occupying buffer slots.
	 */
	constructor(handle: SubscriptionHandle, keepAlive = true, key?: string) {
		this.#handle = handle;
		this.#keepAlive = keepAlive;
		this.#key = key;
		this.#open();
		this.#startTimer(UNCLAIMED_TIMEOUT_MS, () => this.#release());
		// Close idle duplicates after opening, so the Convex client keeps the
		// shared subscription instead of removing and re-adding it.
		if (key !== undefined) {
			for (const [query, close] of idleQueries) {
				if (query.#key === key) close();
			}
		}
	}

	/** Current lifecycle phase. Exposed for tests and debugging. */
	get phase(): Phase {
		return this.#phase;
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
	}

	/** No longer in use: move into the idle buffer, or close right away. */
	#release(): void {
		if (this.#phase !== 'unclaimed' && this.#phase !== 'active') return;
		this.#clearTimer();
		if (!this.#keepAlive || keepAliveConfig.maxQueries === 0) {
			this.#close();
			return;
		}
		this.#phase = 'idle';
		idleQueries.set(this, () => this.#close());
		if (Number.isFinite(keepAliveConfig.maxIdleMs)) {
			this.#startTimer(keepAliveConfig.maxIdleMs, () => this.#close());
		}
		trimIdleQueries();
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
	keepAliveConfig = { ...DEFAULT_KEEP_ALIVE };
}
