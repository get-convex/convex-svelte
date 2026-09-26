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
import { convexToJson, jsonToConvex, type JSONValue, type Value } from 'convex/values';
import { isInitialHydration } from '../internal/singleton.js';

/** `convexLoad` results recorded during one server request, by query key. */
export type HydrationCollector = Map<string, { value: Value; result: object }>;

let collectorGetter: (() => HydrationCollector | undefined) | null = null;

/**
 * Register how to find the current request's collector. Called once by
 * `hydration-server.ts`, so universal code never imports `node:async_hooks`.
 * @internal
 */
export function _setHydrationCollectorGetter(getter: () => HydrationCollector | undefined): void {
	collectorGetter = getter;
}

/** Results serialized by the SvelteKit transport (server loads) — never embedded twice. */
const transportedResults = new WeakSet<object>();

/**
 * Server: remember a `convexLoad` result for the SSR payload. No-op unless the
 * `convexLoadHydration` handle is active for this request.
 *
 * @param key - See `query-key.ts`.
 * @param value - The query result.
 * @param result - The object returned by `convexLoad`, to detect transported results.
 */
export function recordForHydration(key: string, value: unknown, result: object): void {
	if (value === undefined) return;
	collectorGetter?.()?.set(key, { value: value as Value, result });
}

/** Server: a result is part of server-load data and reaches the browser via the transport. */
export function markTransported(result: object): void {
	transportedResults.add(result);
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
 * Server: build the `<script>` element holding the collected results, or
 * `''` when there is nothing to embed.
 */
export function serializeHydrationPayload(collector: HydrationCollector): string {
	const payload: Record<string, JSONValue> = {};
	let count = 0;
	for (const [key, { value, result }] of collector) {
		if (transportedResults.has(result)) continue;
		payload[key] = convexToJson(value);
		count += 1;
	}
	if (count === 0) return '';
	const json = JSON.stringify(payload).replace(unsafeCharacters, (c) => escapes[c]);
	return `<script type="application/json" ${PAYLOAD_ATTRIBUTE}>${json}</script>`;
}

/** Server: insert the payload into the page HTML, before `</body>`. */
export function injectHydrationPayload(html: string, collector: HydrationCollector): string {
	const script = serializeHydrationPayload(collector);
	if (!script) return html;
	const index = html.lastIndexOf('</body>');
	return index === -1 ? html + script : html.slice(0, index) + script + html.slice(index);
}

/** Browser: parsed payload of the initial document; `null` once hydration is over. */
let clientPayload: Map<string, JSONValue> | null | undefined;

function readClientPayload(): Map<string, JSONValue> {
	const element = globalThis.document?.querySelector(`script[${PAYLOAD_ATTRIBUTE}]`);
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

/** Reset browser state. Tests only. */
export function _resetHydrationPayload(): void {
	clientPayload = undefined;
}
