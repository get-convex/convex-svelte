/**
 * Server half of the `convexLoad` SSR hydration payload (see `hydration.ts`).
 *
 * Import from `convex-svelte/sveltekit/server`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Handle } from '@sveltejs/kit';
import {
	_setHydrationCollectorGetter,
	injectHydrationPayload,
	type HydrationCollector
} from './hydration.js';

const collectorStorage = new AsyncLocalStorage<HydrationCollector>();

// Register the getter so convexLoad can record results without importing
// node:async_hooks itself.
_setHydrationCollectorGetter(() => collectorStorage.getStore());

/**
 * SvelteKit `handle` that embeds `convexLoad()` / `convexLoadPaginated()`
 * results from universal load functions (`+page.ts`, `+layout.ts`) in the
 * server-rendered HTML.
 *
 * SvelteKit re-runs universal loads in the browser during hydration, before
 * `setupAuth()` has authenticated the client. With this handle, those loads
 * reuse the server's (authenticated) results instead of querying again — no
 * unauthenticated query, and no waiting for the WebSocket before the page is
 * interactive. Results of server loads (`+page.server.ts`) already reach the
 * browser through the transport hook and are not embedded again.
 *
 * @example
 * ```ts
 * // hooks.server.ts
 * import { sequence } from '@sveltejs/kit/hooks';
 * import { convexLoadHydration, withServerConvexToken } from 'convex-svelte/sveltekit/server';
 *
 * export const handle = sequence(convexLoadHydration, async ({ event, resolve }) => {
 *   const token = await getToken(event.cookies);
 *   return withServerConvexToken(token, () => resolve(event));
 * });
 * ```
 */
export const convexLoadHydration: Handle = ({ event, resolve }) => {
	const collector: HydrationCollector = new Map();
	return collectorStorage.run(collector, () =>
		resolve(event, {
			transformPageChunk: ({ html }) => injectHydrationPayload(html, collector)
		})
	);
};
