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

/** Elements whose content the HTML parser treats as text: tags inside don't count. */
const rawTextElements = new Set([
	'script',
	'style',
	'textarea',
	'title',
	'noscript',
	'iframe',
	'noembed',
	'noframes',
	'xmp'
]);

const isTagBoundary = (char: string | undefined) => char === undefined || /[\s/>]/.test(char);

/** Index just past the `>` of the tag starting at `start`, skipping quoted attribute values. */
function endOfTag(html: string, start: number): number {
	for (let i = start + 1; i < html.length; i++) {
		const char = html[i];
		if (char === '>') return i + 1;
		if (char !== '=') continue;
		let valueStart = i + 1;
		while (/\s/.test(html[valueStart] ?? '')) valueStart++;
		const quote = html[valueStart];
		if (quote === '"' || quote === "'") {
			const close = html.indexOf(quote, valueStart + 1);
			if (close === -1) return -1;
			i = close;
		}
	}
	return -1;
}

/** Index of the end tag `</name` closing a raw-text element, from `from` on. */
function closingTagIndex(html: string, name: string, from: number): number {
	for (let i = html.indexOf(`</${name}`, from); i !== -1; i = html.indexOf(`</${name}`, i + 1)) {
		if (isTagBoundary(html[i + name.length + 2])) return i;
	}
	return -1;
}

/**
 * Index of the first real `tag` (e.g. `</head` or `<body`) in `html`: skips
 * comments, attribute values, and the content of raw-text elements such as
 * `<script>` — `"</head>"` inside a script string is not the end of the head.
 * `-1` if there is none.
 */
export function findTag(html: string, tag: string): number {
	// ASCII-only case folding keeps every index valid for `html` (unlike
	// toLowerCase(), which can change the length, e.g. for "İ").
	const lower = html.replace(/[A-Z]+/g, (match) => match.toLowerCase());
	let i = lower.indexOf('<');
	while (i !== -1) {
		if (lower.startsWith('<!--', i)) {
			const end = lower.indexOf('-->', i + 4);
			if (end === -1) return -1;
			i = lower.indexOf('<', end + 3);
			continue;
		}
		if (lower.startsWith(tag, i) && isTagBoundary(lower[i + tag.length])) return i;

		const name = /^<\/?([a-z][^\s/>]*)/.exec(lower.slice(i, i + 32))?.[1];
		if (name === undefined) {
			// A `<` that doesn't start a tag is text.
			i = lower.indexOf('<', i + 1);
			continue;
		}
		const tagEnd = endOfTag(lower, i);
		if (tagEnd === -1) return -1;
		if (lower[i + 1] !== '/' && rawTextElements.has(name)) {
			i = closingTagIndex(lower, name, tagEnd);
			continue;
		}
		i = lower.indexOf('<', tagEnd);
	}
	return -1;
}

/**
 * Server: insert the payload into the page HTML — in `<head>`, so the parser
 * has created it before SvelteKit's start script (in `<body>`) can run the
 * hydration loads, even with inline bundles or a slowly streamed document.
 */
export function injectHydrationPayload(html: string, collector: HydrationCollector): string {
	const script = serializeHydrationPayload(collector);
	for (const tag of ['</head', '<body']) {
		const index = findTag(html, tag);
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
			'universal loads (a streamed result is only embedded if it finished before the page ' +
			'HTML was generated) and pass the same args on the server and in the browser, or ' +
			'pass { hydrate: false } to silence this.'
	);
}

/** Reset browser state. Tests only. */
export function _resetHydrationPayload(): void {
	clientPayload = undefined;
	hasPayloadElement = false;
}
