/**
 * ConvexClient lifecycle — module singleton for SvelteKit.
 *
 * Two init points (both idempotent, share the same instance):
 * - `initConvex(url)` in hooks.client.ts — early init so transport.decode can subscribe
 * - `setupConvex(url)` in root layout — handles context + cleanup, calls initConvex internally
 */
import { ConvexClient, type ConvexClientOptions } from 'convex/browser';
import { getSingletonClient, getSingletonUrl, setSingleton } from '../internal/singleton.js';

const IS_BROWSER = typeof globalThis.document !== 'undefined';

/**
 * Initialize the Convex client at module level (before any component mounts).
 * Call from `hooks.client.ts` to ensure the client exists before `transport.decode`.
 * Idempotent — subsequent calls with the same URL are no-ops.
 *
 * @param url - Your Convex deployment URL (e.g. `PUBLIC_CONVEX_URL`).
 * @param options - Optional `ConvexClientOptions`.
 * @returns The singleton `ConvexClient` instance.
 */
export function initConvex(url: string, options: ConvexClientOptions = {}): ConvexClient {
	if (!url || typeof url !== 'string') {
		throw new Error('initConvex requires a non-empty URL string');
	}
	const existing = getSingletonClient();
	if (existing) {
		// Only one deployment per app is supported — fail loudly instead of
		// silently handing back a client for a different URL.
		if (getSingletonUrl() !== url) {
			throw new Error(
				`initConvex() was called with ${url}, but the Convex client is already initialized for ${getSingletonUrl()}. ` +
					'Only one deployment per app is supported. Call closeConvex() first to switch deployments.'
			);
		}
		return existing;
	}
	const client = new ConvexClient(url, { disabled: !IS_BROWSER, ...options });
	setSingleton(url, client);
	return client;
}
