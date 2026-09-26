/**
 * Svelte/SvelteKit glue for route-scoped detached queries.
 *
 * - Watches `page.data` and reconciles which queries the current route uses.
 * - Tracks effects reading a query, so a query stays subscribed while it is
 *   rendered even if it is not reachable from `page.data` (e.g. a layout
 *   query shadowed by a page key, or a streamed promise).
 *
 * See `query-lifecycle.ts` for the lifecycle rules.
 */
import { untrack } from 'svelte';
import { createSubscriber } from 'svelte/reactivity';
import { page } from '$app/state';
import { RouteQuery, reconcileRouteQueries, type SubscriptionHandle } from './query-lifecycle.js';

let watching = false;

/** Start reconciling route-scoped queries against `page.data`. Idempotent. */
function watchRouteData(): void {
	if (watching) return;
	watching = true;
	$effect.root(() => {
		$effect(() => {
			const data = page.data;
			untrack(() => reconcileRouteQueries(data));
		});
	});
}

/**
 * Create a route-scoped query lifecycle for a detached query.
 *
 * @param handle - Opens/closes the underlying Convex subscription.
 * @param keepAlive - Whether the query may use the idle buffer after release.
 * @returns The lifecycle and a `track` function to call from every getter of
 * the query result, so reading effects keep the query subscribed.
 */
export function createRouteQuery(
	handle: SubscriptionHandle,
	keepAlive: boolean
): { query: RouteQuery; track: () => void } {
	watchRouteData();
	const query = new RouteQuery(handle, keepAlive);
	const track = createSubscriber(() => {
		query.retainReader();
		return () => query.releaseReader();
	});
	return { query, track };
}
