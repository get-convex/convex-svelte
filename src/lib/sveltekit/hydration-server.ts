/**
 * Server half of the `convexLoad` SSR hydration payload (see `hydration.ts`).
 *
 * Import from `convex-svelte/sveltekit/server/hydration` — a separate entry
 * from `convex-svelte/sveltekit/server`, because it needs SvelteKit internals
 * (2.56+) that must not break `withServerConvexToken` on older versions.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Handle } from '@sveltejs/kit';
// Internal SvelteKit entry (used by its generated server code); it ships no
// module types. Imported statically so we share SvelteKit's module instance.
// @ts-expect-error -- no type declarations for this internal entry
import * as kitInternal from '@sveltejs/kit/internal/server';
import {
	_setHydrationCollectorGetter,
	injectHydrationPayload,
	type HydrationCollector
} from './hydration.js';

const collectorStorage = new AsyncLocalStorage<HydrationCollector>();

// SvelteKit (2.56+) marks the request store while a universal load runs on the
// server (`state.is_in_universal_load`) — its remote functions use the same flag
// to decide which results to serialize for hydration. There is no public API
// for it, so read it defensively: if it can't be read, nothing is embedded and
// convexLoad behaves as without this handle.
type RequestStore = { state?: { is_in_universal_load?: unknown } } | null;
const tryGetRequestStore = (
	kitInternal as unknown as { try_get_request_store?: () => RequestStore }
).try_get_request_store;

/** The marker's value in the current request context; `undefined` if unreadable. */
function readUniversalLoadMarker(): unknown {
	try {
		return tryGetRequestStore?.()?.state?.is_in_universal_load;
	} catch {
		return undefined;
	}
}

function isInUniversalLoad(): boolean {
	return readUniversalLoadMarker() === true;
}

// Only record results of universal loads: those re-run in the browser, which
// would fetch the same data itself. Server loads (+page.server.ts) may fetch
// data they never return (or return only in part) — it must never end up in
// the HTML. Their returned results reach the browser through the transport.
_setHydrationCollectorGetter(() => (isInUniversalLoad() ? collectorStorage.getStore() : undefined));

let warnedUnsupported = false;

/**
 * Inside `handle`, SvelteKit's request store exists and the marker is `false`.
 * Anything else means this SvelteKit version can't tell universal loads apart.
 */
function checkMarkerSupport(): void {
	if (warnedUnsupported || typeof readUniversalLoadMarker() === 'boolean') return;
	warnedUnsupported = true;
	console.warn(
		'[convex-svelte] convexLoadHydration needs SvelteKit 2.56 or later to detect universal ' +
			'load functions. No convexLoad results are embedded.'
	);
}

/**
 * SvelteKit `handle` that embeds `convexLoad()` / `convexLoadPaginated()`
 * results from universal load functions (`+page.ts`, `+layout.ts`) in the
 * server-rendered HTML.
 *
 * SvelteKit re-runs universal loads in the browser during hydration, before
 * `setupAuth()` has authenticated the client. With this handle, those loads
 * reuse the server's (authenticated) results instead of querying again — no
 * unauthenticated query, and no waiting for the WebSocket before the page is
 * interactive. Results of server loads (`+page.server.ts`) are never embedded;
 * the ones they return reach the browser through the transport hook.
 *
 * Everything `convexLoad` fetches while a universal load runs is embedded —
 * including calls in helpers it invokes. Pass `{ hydrate: false }` for results
 * that must not reach the browser. Requires SvelteKit 2.56 or later.
 *
 * @example
 * ```ts
 * // hooks.server.ts
 * import { sequence } from '@sveltejs/kit/hooks';
 * import { withServerConvexToken } from 'convex-svelte/sveltekit/server';
 * import { convexLoadHydration } from 'convex-svelte/sveltekit/server/hydration';
 *
 * export const handle = sequence(convexLoadHydration, async ({ event, resolve }) => {
 *   const token = await getToken(event.cookies);
 *   return withServerConvexToken(token, () => resolve(event));
 * });
 * ```
 */
export const convexLoadHydration: Handle = ({ event, resolve }) => {
	checkMarkerSupport();
	const collector: HydrationCollector = new Map();
	return collectorStorage.run(collector, () =>
		resolve(event, {
			transformPageChunk: ({ html }) => injectHydrationPayload(html, collector)
		})
	);
};
