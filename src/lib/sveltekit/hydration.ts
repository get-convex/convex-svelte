/**
 * Hydration for `convexLoad()` / `convexLoadPaginated()` in universal load
 * functions (`+page.ts` / `+layout.ts`), built on SvelteKit's fetch replay.
 *
 * SvelteKit runs universal loads on the server, then again in the browser
 * while the page hydrates — before the root layout's `setupAuth()` has
 * authenticated the client. When a load passes its `fetch`, convexLoad sends
 * its server query through that fetch to the endpoint served by the
 * `convexLoadHydration` handle (`hydration-server.ts`). SvelteKit records the
 * response in the page and replays it when the same load runs during
 * hydration: no request, and no query before auth. SvelteKit only records
 * fetches of universal loads, so results of server loads never end up in the
 * HTML.
 *
 * This module is universal; the endpoint lives in `hydration-server.ts`.
 */
import { DEV } from 'esm-env';
import * as paths from '$app/paths';
import { ConvexError, convexToJson, jsonToConvex, type JSONValue, type Value } from 'convex/values';

/** Path prefix of the endpoint the `convexLoadHydration` handle serves. */
export const HYDRATION_PATH = '/__convex-svelte/q/';

/**
 * Endpoint pathnames: one per page, query and args (`<prefix><hash>`).
 * Prerendering writes every fetch of a page to a file named after its
 * pathname, and at runtime SvelteKit's server-side fetch sends requests to
 * such a path to the static file instead of through the app. So the pathname
 * is neither the page's own nor shared with any other page — a prerendered
 * page and a server-rendered one never request the same path.
 */
export const HYDRATION_PATHNAME = /\/__convex-svelte\/q\/[0-9a-z]+$/;

let serverPagePathname: (() => string | undefined) | undefined;

/**
 * Register how the server reads the pathname of the page being rendered: the
 * `convexLoadHydration` handle keeps it per request. Universal load functions
 * can't read it on the server otherwise.
 * @internal
 */
export function _setServerPagePathname(getter: () => string | undefined): void {
	serverPagePathname = getter;
}

/** Pathname of the page being rendered, the same on the server and in the browser. */
function pagePathname(): string {
	return serverPagePathname?.() ?? globalThis.location?.pathname ?? '';
}

/**
 * URL of the endpoint for a request body on the current page, under the app's
 * base path (`kit.paths.base`): SvelteKit's server-side fetch only routes
 * requests inside it through the app (handle, cookies, recording for replay).
 *
 * On the server with relative paths (SvelteKit's default) this is relative to
 * the page, in the browser absolute; SvelteKit records and matches the
 * resolved path, so both sides agree.
 */
function endpointUrl(body: string): string {
	const path = `${HYDRATION_PATH}${hash(`${pagePathname()} ${body}`)}`;
	// SvelteKit 2.26+ and 3 have resolve(); before 2.26 SvelteKit 2 only has base,
	// and SvelteKit 3 no longer exports base. Each export is missing in some
	// supported version, so read them dynamically rather than importing them.
	const resolve = Reflect.get(paths, 'resolve') as ((path: string) => string) | undefined;
	if (typeof resolve === 'function') return resolve(path);
	const base = Reflect.get(paths, 'base') as string | undefined;
	return `${base ?? ''}${path}`;
}

/** Short, stable hash (53-bit cyrb53) of a string, in base 36. */
function hash(value: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < value.length; i++) {
		const char = value.charCodeAt(i);
		h1 = Math.imul(h1 ^ char, 2654435761);
		h2 = Math.imul(h2 ^ char, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** SvelteKit's `fetch` from the load event. */
export type LoadFetch = typeof globalThis.fetch;

/** Request body: `name` is the Convex function name, `args` its Convex JSON args. */
export type HydrationRequestBody = { name: string; args: JSONValue };

/** Response body: the query's Convex JSON value, or the error it threw. */
export type HydrationResponseBody =
	| { value: JSONValue }
	| { error: { message: string; data?: JSONValue } };

/**
 * Run a query through the endpoint with the load's `fetch`. The request is
 * identical on the server and in the browser, which is what SvelteKit matches
 * when it replays the server's response during hydration.
 *
 * @returns The query result, or `undefined` if the endpoint isn't there (the
 * `convexLoadHydration` handle isn't installed) — the caller then queries
 * directly.
 * @throws The query's error, like `ConvexHttpClient.query()` would.
 */
export async function queryThroughHydration(
	fetch: LoadFetch,
	functionName: string,
	args: Record<string, unknown>
): Promise<{ value: Value } | undefined> {
	const body = JSON.stringify({
		name: functionName,
		args: convexToJson(args as Value)
	} satisfies HydrationRequestBody);
	let result: unknown;
	try {
		const response = await fetch(endpointUrl(body), {
			method: 'POST',
			// JSON, not a form submission: SvelteKit's CSRF check would reject a
			// text/plain POST when `paths.origin` differs from the request origin.
			headers: { 'content-type': 'application/json' },
			body
		});
		// Recognized by its body: a response SvelteKit replays carries no headers,
		// and without the handle the request gets SvelteKit's 404 page.
		result = response.ok ? await response.json().catch(() => undefined) : undefined;
	} catch {
		// Unreachable (e.g. a network error): query directly instead.
		result = undefined;
	}
	if (!isHydrationResponse(result)) {
		warnOnce(
			'handle',
			"[convex-svelte] convexLoad({ fetch }) couldn't reach the convexLoadHydration endpoint, " +
				'so it queries Convex directly. Add the handle to hooks.server.ts, and pass fetch ' +
				'in universal loads (+page.ts) — server loads need no fetch.'
		);
		return undefined;
	}
	if ('error' in result) {
		if (result.error.data === undefined) throw new Error(result.error.message);
		// Like ConvexHttpClient: the data, plus the server's message (with its
		// request ID) instead of the stringified data ConvexError would default to.
		const error = new ConvexError(jsonToConvex(result.error.data));
		error.message = result.error.message;
		throw error;
	}
	return { value: jsonToConvex(result.value) };
}

function isHydrationResponse(value: unknown): value is HydrationResponseBody {
	return typeof value === 'object' && value !== null && ('value' in value || 'error' in value);
}

/**
 * Browser, dev only: a universal load ran convexLoad during hydration without
 * passing `fetch`, so it queries Convex before `setupAuth()`.
 */
export function warnMissingFetch(functionName: string): void {
	warnOnce(
		`fetch:${functionName}`,
		`[convex-svelte] ${functionName}: convexLoad in a universal load re-runs in the browser ` +
			"during hydration, before auth is set up. Pass the load's fetch to reuse the server " +
			'result: `export const load = async ({ fetch }) => ({ x: await convexLoad(query, args, ' +
			'{ fetch }) })`, with the convexLoadHydration handle in hooks.server.ts.'
	);
}

const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
	if (!DEV || warned.has(key)) return;
	warned.add(key);
	console.warn(message);
}

/** Reset dev warnings. Tests only. */
export function _resetHydrationWarnings(): void {
	warned.clear();
}
