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
 * Server: build the `<script>` element holding the collected results. Emitted
 * even when empty, so the browser knows the handle is active (dev warnings).
 */
export function serializeHydrationPayload(collector: HydrationCollector): string {
	const payload: Record<string, JSONValue> = {};
	for (const [key, value] of collector) {
		payload[key] = convexToJson(value);
	}
	const json = JSON.stringify(payload).replace(unsafeCharacters, (c) => escapes[c]);
	return `<script type="application/json" ${PAYLOAD_ATTRIBUTE}>${json}</script>`;
}

/**
 * Server: insert the payload into the page HTML — in `<head>`, so the parser
 * has created it before SvelteKit's start script (in `<body>`) can run the
 * hydration loads, even with inline bundles or a slowly streamed document.
 */
export function injectHydrationPayload(html: string, collector: HydrationCollector): string {
	const script = serializeHydrationPayload(collector);
	for (const tag of ['</head>', '<body']) {
		const index = html.indexOf(tag);
		if (index !== -1) return html.slice(0, index) + script + html.slice(index);
	}
	return script + html;
}

/** Browser: parsed payload of the initial document; `null` once hydration is over. */
let clientPayload: Map<string, JSONValue> | null | undefined;
/** Browser: the initial document contained a payload, i.e. the handle is active. */
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
	return json === undefined ? undefined : { value: jsonToConvex(json) };
}

/**
 * Browser, dev only: explain why a load re-running during hydration found no
 * server result although the handle is active — it now queries Convex before
 * `setupAuth()`.
 */
export function warnHydrationMiss(functionName: string): void {
	if (!DEV || !hasPayloadElement || !isInitialHydration()) return;
	console.warn(
		`[convex-svelte] ${functionName}: no server result to reuse during hydration, so it ` +
			'queries Convex before setupAuth() authenticated the client. Await convexLoad() in ' +
			'universal loads (streamed promises are not embedded) and pass the same args on the ' +
			'server and in the browser, or pass { hydrate: false } to silence this.'
	);
}

/** Reset browser state. Tests only. */
export function _resetHydrationPayload(): void {
	clientPayload = undefined;
	hasPayloadElement = false;
}
