/**
 * ConvexClient lifecycle — module singleton for SvelteKit.
 *
 * Two init points (both idempotent, share the same instance):
 * - `initConvex(url)` in hooks.client.ts — early init so transport.decode can subscribe
 * - `setupConvex(url)` in root layout — handles context + cleanup, calls initConvex internally
 */
import { ConvexClient, type ConvexClientOptions } from 'convex/browser';
import { getSingletonClient, getSingletonUrl, setSingleton } from '../internal/singleton.js';
import { configureKeepAlive, type KeepAliveOptions } from './query-lifecycle.js';

const IS_BROWSER = typeof globalThis.document !== 'undefined';

export type InitConvexOptions = ConvexClientOptions & {
	/**
	 * Idle buffer for queries created by `convexLoad()` / `convexLoadPaginated()`.
	 * When the current route no longer uses such a query, it stays subscribed until
	 * `maxQueries` newer idle queries push it out or `maxIdleMs` passes, so back
	 * navigation and revisits are instant. Pass `false` to unsubscribe immediately.
	 * @default { maxQueries: 10, maxIdleMs: 60_000 }
	 */
	keepAlive?: KeepAliveOptions | false;
};

/**
 * Initialize the Convex client at module level (before any component mounts).
 * Call from `hooks.client.ts` to ensure the client exists before `transport.decode`.
 * Idempotent — subsequent calls with the same URL return the existing client.
 * A `keepAlive` option is still applied, so editing it in `hooks.ts` takes
 * effect on HMR.
 *
 * @param url - Your Convex deployment URL (e.g. `PUBLIC_CONVEX_URL`).
 * @param options - Optional `ConvexClientOptions`, plus `keepAlive` for `convexLoad()` queries.
 * @returns The singleton `ConvexClient` instance.
 */
export function initConvex(url: string, options: InitConvexOptions = {}): ConvexClient {
	if (!url || typeof url !== 'string') {
		throw new Error('initConvex requires a non-empty URL string');
	}
	const { keepAlive, ...clientOptions } = options;
	const existing = getSingletonClient();
	// Only one deployment per app is supported — fail loudly instead of
	// silently handing back a client for a different URL.
	if (existing && getSingletonUrl() !== url) {
		throw new Error(
			`initConvex() was called with ${url}, but the Convex client is already initialized for ${getSingletonUrl()}. ` +
				'Only one deployment per app is supported. Call closeConvex() first to switch deployments.'
		);
	}
	// Applied only after validation, so a rejected call has no side effects.
	if (keepAlive !== undefined) {
		configureKeepAlive(keepAlive);
	}
	if (existing) {
		return existing;
	}
	const client = new ConvexClient(url, { disabled: !IS_BROWSER, ...clientOptions });
	setSingleton(url, client);
	return client;
}
