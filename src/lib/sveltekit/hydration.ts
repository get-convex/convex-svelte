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
import { ConvexError, convexToJson, jsonToConvex, type JSONValue, type Value } from 'convex/values';

/** Query parameter that marks requests to the endpoint of the `convexLoadHydration` handle. */
export const HYDRATION_PARAM = '__convex-svelte';

/**
 * The endpoint is the page itself plus a marker. SvelteKit resolves this
 * relative URL against the page — on the server and in the browser alike —
 * so it is always inside the app (and its `kit.paths.base`), where SvelteKit's
 * server-side fetch routes requests through the handle with the user's
 * cookies, and both sides record and match the same URL for the replay.
 */
export const HYDRATION_URL = `?${HYDRATION_PARAM}=query`;

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
	const body: HydrationRequestBody = { name: functionName, args: convexToJson(args as Value) };
	const response = await fetch(HYDRATION_URL, {
		method: 'POST',
		// JSON, not a form submission: SvelteKit's CSRF check would reject a
		// text/plain POST when `paths.origin` differs from the request origin.
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	// Recognized by its body: a response SvelteKit replays carries no headers,
	// and without the handle the request gets SvelteKit's 404 page.
	const result: unknown = response.ok ? await response.json().catch(() => undefined) : undefined;
	if (!isHydrationResponse(result)) {
		warnOnce(
			'handle',
			'[convex-svelte] convexLoad({ fetch }) needs the convexLoadHydration handle in ' +
				'hooks.server.ts. Without it, the load queries Convex directly and re-runs in the ' +
				'browser before auth is set up.'
		);
		return undefined;
	}
	if ('error' in result) {
		throw result.error.data === undefined
			? new Error(result.error.message)
			: new ConvexError(jsonToConvex(result.error.data));
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
