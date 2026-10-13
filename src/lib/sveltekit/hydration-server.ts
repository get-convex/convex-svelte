/**
 * Server half of the `convexLoad` SSR hydration payload (see `hydration.ts`).
 *
 * Import from `convex-svelte/sveltekit/server/hydration` — a separate entry
 * from `convex-svelte/sveltekit/server`, because it needs SvelteKit internals
 * (2.56+) that must not break `withServerConvexToken` on older versions.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { DEV } from 'esm-env';
import type { Handle } from '@sveltejs/kit';
// Internal SvelteKit entry (used by its generated server code); it ships no
// module types. Imported statically so we share SvelteKit's module instance.
// @ts-expect-error -- no type declarations for this internal entry
import * as kitInternal from '@sveltejs/kit/internal/server';
import {
	_setHydrationCollectorGetter,
	HYDRATION_PLACEHOLDER,
	serializeHydrationPayload,
	type HydrationCollector
} from './hydration.js';

const collectorStorage = new AsyncLocalStorage<HydrationCollector>();

// SvelteKit (2.56+) marks the request store while a universal load runs on the
// server (`state.is_in_universal_load`) — its remote functions use the same flag
// to decide which results to serialize for hydration. A remote function called
// from a universal load copies that state and sets `is_in_remote_function`, so
// both flags are needed. There is no public API for them, so read them
// defensively and fail closed: anything but the exact values SvelteKit sets
// means nothing is embedded and convexLoad behaves as without this handle.
type RequestState = {
	is_in_universal_load?: unknown;
	is_in_remote_function?: unknown;
	/** SvelteKit 3 only; used to tell it apart from older SvelteKit 2 versions. */
	is_in_remote_query?: unknown;
};
type RequestStore = { state?: RequestState } | null;
const tryGetRequestStore = (
	kitInternal as unknown as { try_get_request_store?: () => RequestStore }
).try_get_request_store;

/** SvelteKit's request state in the current context; `undefined` if unreadable. */
function readRequestState(): RequestState | undefined {
	try {
		return tryGetRequestStore?.()?.state;
	} catch {
		return undefined;
	}
}

/** Running in a universal load, and not in a remote function it called. */
function isInUniversalLoad(): boolean {
	const state = readRequestState();
	return state?.is_in_universal_load === true && state.is_in_remote_function === false;
}

// Only record results of universal loads: those re-run in the browser, which
// would fetch the same data itself. Server loads (+page.server.ts) may fetch
// data they never return (or return only in part) — it must never end up in
// the HTML. Their returned results reach the browser through the transport.
_setHydrationCollectorGetter(() => (isInUniversalLoad() ? collectorStorage.getStore() : undefined));

let warnedUnsupported = false;

/**
 * Inside `handle`, SvelteKit's request store exists and both markers are
 * `false`. Anything else means this SvelteKit version can't tell universal
 * loads (or remote functions) apart.
 */
function checkMarkerSupport(): void {
	const state = readRequestState();
	if (
		warnedUnsupported ||
		(typeof state?.is_in_universal_load === 'boolean' &&
			typeof state.is_in_remote_function === 'boolean')
	) {
		return;
	}
	warnedUnsupported = true;
	console.warn(
		typeof state?.is_in_remote_query === 'boolean'
			? '[convex-svelte] convexLoadHydration has no effect on SvelteKit 3 (it no longer marks ' +
					'universal load functions), so no convexLoad results are embedded. A convexLoad() in ' +
					'+page.ts / +layout.ts now re-runs in the browser before auth is set up. Fix: move ' +
					'convexLoad() calls that need auth into +page.server.ts / +layout.server.ts (same code, ' +
					'no other change), and remove convexLoadHydration from hooks.server.ts. See ' +
					'https://docs.convex.dev/client/svelte/sveltekit-server-rendering#convexloadhydration'
			: '[convex-svelte] convexLoadHydration needs SvelteKit 2.56 or later to detect universal ' +
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
 * including calls in helpers it invokes, but not in remote functions it calls.
 * Pass `{ hydrate: false }` for results that must not reach the browser.
 * Requires SvelteKit 2.56 or later.
 *
 * The payload replaces a `%convex.hydration%` placeholder, which must be in the
 * `<head>` of `src/app.html` (before SvelteKit's start script in `<body>`):
 *
 * ```html
 * <head>
 *   %sveltekit.head%
 *   %convex.hydration%
 * </head>
 * ```
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
	let replaced = false;
	return collectorStorage.run(collector, () =>
		resolve(event, {
			transformPageChunk: ({ html, done }) => {
				if (!replaced && html.includes(HYDRATION_PLACEHOLDER)) {
					replaced = true;
					return html.replace(HYDRATION_PLACEHOLDER, () => serializeHydrationPayload(collector));
				}
				if (done && !replaced && collector.size > 0) warnMissingPlaceholder();
				return html;
			}
		})
	);
};

let warnedMissingPlaceholder = false;

function warnMissingPlaceholder(): void {
	if (!DEV || warnedMissingPlaceholder) return;
	warnedMissingPlaceholder = true;
	console.warn(
		`[convex-svelte] convexLoadHydration: add ${HYDRATION_PLACEHOLDER} to the <head> of ` +
			'src/app.html. Without it, no convexLoad results are embedded.'
	);
}
