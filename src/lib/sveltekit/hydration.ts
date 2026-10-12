/**
 * SSR hydration payload for `convexLoad()` / `convexLoadPaginated()` in
 * universal (`+page.ts` / `+layout.ts`) load functions.
 *
 * SvelteKit re-runs universal loads in the browser during hydration — before
 * the root layout's `setupAuth()` has authenticated the client. Re-fetching
 * there would return unauthenticated data and delay interactivity. Instead,
 * the server embeds its `convexLoad` results in the HTML (opt-in via the
 * `convexLoadHydration` handle), and the loads re-running during hydration
 * reuse them. The live subscription then starts after auth, like for the
 * transport path of server loads.
 *
 * This module is universal: the server-only half (AsyncLocalStorage + handle)
 * lives in `hydration-server.ts` and registers the collector getter.
 */
import { DEV } from 'esm-env';
import { convexToJson, jsonToConvex, type JSONValue, type Value } from 'convex/values';
import { isInitialHydration } from '../internal/singleton.js';

/** `convexLoad` results of universal loads recorded during one server request, by query key. */
export type HydrationCollector = Map<string, Value>;

let collectorGetter: (() => HydrationCollector | undefined) | null = null;

/**
 * Register how to find the current request's collector — only while a
 * universal load runs. Called once by `hydration-server.ts`, so universal code
 * never imports `node:async_hooks` or SvelteKit internals.
 * @internal
 */
export function _setHydrationCollectorGetter(getter: () => HydrationCollector | undefined): void {
	collectorGetter = getter;
}

/**
 * Server: remember a `convexLoad` result for the SSR payload. No-op unless the
 * `convexLoadHydration` handle is active and a universal load is running.
 *
 * @param key - See `query-key.ts`.
 * @param value - The query result.
 */
export function recordForHydration(key: string, value: unknown): void {
	if (value === undefined) return;
	collectorGetter?.()?.set(key, value as Value);
}

export const PAYLOAD_ATTRIBUTE = 'data-convex-load';

/**
 * Placeholder in the `<head>` of `src/app.html` that `convexLoadHydration`
 * replaces with the payload. A placeholder replaced in `transformPageChunk` is
 * how SvelteKit's docs inject request-specific markup (e.g. `%lang%`).
 */
export const HYDRATION_PLACEHOLDER = '%convex.hydration%';

// Inside a <script> element only `</script` and `<!--` are special; escaping
// every `<` covers both. U+2028/U+2029 are escaped for older JS parsers.
// Same approach as SvelteKit's own serialize_data.
const unsafeCharacters = /[<\u2028\u2029]/g;
const escapes: Record<string, string> = {
	'<': '\\u003C',
	'\u2028': '\\u2028',
	'\u2029': '\\u2029'
};

/**
 * Server: build the `<script>` element holding the collected results, or `''`
 * when nothing was collected (e.g. `ssr = false`, or no universal convexLoad).
 * The browser then knows any element it finds holds real server results.
 */
export function serializeHydrationPayload(collector: HydrationCollector): string {
	if (collector.size === 0) return '';
	const payload: Record<string, JSONValue> = {};
	for (const [key, value] of collector) {
		payload[key] = convexToJson(value);
	}
	const json = JSON.stringify(payload).replace(unsafeCharacters, (c) => escapes[c]);
	return `<script type="application/json" ${PAYLOAD_ATTRIBUTE}>${json}</script>`;
}

/** Browser: parsed payload of the initial document; `null` once hydration is over. */
let clientPayload: Map<string, JSONValue> | null | undefined;
/** Browser: the initial document contained server results (the handle is active). */
let hasPayloadElement = false;

function readClientPayload(): Map<string, JSONValue> {
	const element = globalThis.document?.querySelector(`script[${PAYLOAD_ATTRIBUTE}]`);
	hasPayloadElement = !!element;
	element?.remove();
	try {
		const json = JSON.parse(element?.textContent || '{}') as Record<string, JSONValue>;
		return new Map(Object.entries(json));
	} catch {
		return new Map();
	}
}

/**
 * Browser: the server's result for `key` while the initial page hydrates.
 * Returns `undefined` once `setupConvex()` / `setupAuth()` have run — later
 * loads are client-side navigations and must never see the stale SSR data.
 */
export function takeHydratedValue(key: string): { value: Value } | undefined {
	if (clientPayload === null) return undefined;
	if (!isInitialHydration()) {
		clientPayload = null;
		return undefined;
	}
	clientPayload ??= readClientPayload();
	const json = clientPayload.get(key);
	if (json === undefined) return undefined;
	try {
		return { value: jsonToConvex(json) };
	} catch (error) {
		// E.g. HTML rewritten by a proxy, or different convex versions on server
		// and client. The payload is only an optimization: query instead.
		warnMalformedPayload(error);
		return undefined;
	}
}

let warnedMalformed = false;

function warnMalformedPayload(error: unknown): void {
	if (!DEV || warnedMalformed) return;
	warnedMalformed = true;
	console.warn('[convex-svelte] Ignoring an unreadable convexLoad hydration payload:', error);
}

/**
 * Browser, dev only: explain why a load re-running during hydration found no
 * server result although the server embedded results for this page — it now
 * queries Convex before `setupAuth()`. Pages without results (e.g. `ssr =
 * false`) stay quiet, since there is nothing to fix there.
 */
export function warnHydrationMiss(functionName: string): void {
	if (!DEV || !hasPayloadElement || !isInitialHydration()) return;
	console.warn(
		`[convex-svelte] ${functionName}: no server result to reuse during hydration, so it ` +
			'queries Convex before setupAuth() authenticated the client. Await convexLoad() in ' +
			'universal loads (a streamed result is only embedded if it finished before the page ' +
			'HTML was generated) and pass the same args on the server and in the browser, or ' +
			'pass { hydrate: false } to silence this.'
	);
}

/** Reset browser state. Tests only. */
export function _resetHydrationPayload(): void {
	clientPayload = undefined;
	hasPayloadElement = false;
	warnedMalformed = false;
}
