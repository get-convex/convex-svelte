/**
 * Server half of `convexLoad` hydration (see `hydration.ts`): the endpoint
 * that a universal load's `fetch` calls, so SvelteKit can record the response
 * and replay it during hydration.
 *
 * Import from `convex-svelte/sveltekit/server/hydration`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { DEV } from 'esm-env';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { ConvexError, convexToJson, jsonToConvex, type JSONValue, type Value } from 'convex/values';
import { getConvexUrl, _getServerToken } from '../internal/singleton.js';
import {
	HYDRATION_PATHNAME,
	_setServerPagePathname,
	type HydrationRequestBody,
	type HydrationResponseBody
} from './hydration.js';
import { _serverTokenContext } from './server-token.js';

// Pathname of the page each request renders, for the endpoint URLs convexLoad
// builds during SSR (see HYDRATION_PATHNAME).
const pageStorage = new AsyncLocalStorage<string>();
_setServerPagePathname(() => pageStorage.getStore());

/**
 * SvelteKit `handle` that lets `convexLoad()` / `convexLoadPaginated()` in
 * universal load functions (`+page.ts`, `+layout.ts`) reuse the server's
 * result during hydration.
 *
 * SvelteKit re-runs universal loads in the browser during hydration, before
 * `setupAuth()` has authenticated the client. When a load passes its `fetch`
 * to `convexLoad`, the server query goes through this handle's endpoint, and
 * SvelteKit replays the response during hydration instead of the load querying
 * Convex again. SvelteKit only does this for universal loads; server loads
 * (`+page.server.ts`) reach the browser through the transport hook.
 *
 * The endpoint runs Convex queries (never mutations or actions) with the token
 * from `withServerConvexToken`, so place this handle after your auth handle.
 *
 * @example
 * ```ts
 * // hooks.server.ts
 * import { sequence } from '@sveltejs/kit/hooks';
 * import { withServerConvexToken } from 'convex-svelte/sveltekit/server';
 * import { convexLoadHydration } from 'convex-svelte/sveltekit/server/hydration';
 *
 * const convexAuth: Handle = async ({ event, resolve }) => {
 *   const token = await getToken(event.cookies);
 *   return withServerConvexToken(token, () => resolve(event));
 * };
 *
 * export const handle = sequence(convexAuth, convexLoadHydration);
 *
 * // +page.ts
 * export const load = async ({ fetch }) => ({
 *   tasks: await convexLoad(api.tasks.get, {}, { fetch })
 * });
 * ```
 */
// Typed structurally rather than as SvelteKit's `Handle`, which SvelteKit 2
// exports from `@sveltejs/kit` and SvelteKit 3 from `@sveltejs/kit/hooks`; this
// is assignable to `Handle` in both.
export function convexLoadHydration<Event extends { url: URL; request: Request }>({
	event,
	resolve
}: {
	event: Event;
	resolve: (event: Event) => Response | Promise<Response>;
}): Response | Promise<Response> {
	// POSTs to an endpoint pathname, below any base path (matched by suffix);
	// everything else is the app's. Read from the request, like everything here.
	const pathname = new URL(event.request.url).pathname;
	return event.request.method === 'POST' && HYDRATION_PATHNAME.test(pathname)
		? handleQuery(event.request)
		: pageStorage.run(pathname, () => resolve(event));
}

/**
 * Convex function names: `path/to/module:export`, or `path/to/module` for a
 * default export. Same grammar as Convex: path components of letters, digits,
 * `_` and `.` with at least one letter or digit, up to 64 characters each.
 * Convex validates the name again; this only turns away garbage early.
 */
function isFunctionName(name: string): boolean {
	const [module, exportName, ...rest] = name.split(':');
	return (
		rest.length === 0 &&
		module.split('/').every((part) => /^[\w.]{1,64}$/.test(part) && /[a-z0-9]/i.test(part)) &&
		(exportName === undefined || /^\w{1,64}$/.test(exportName))
	);
}

async function handleQuery(request: Request): Promise<Response> {
	// convexLoad always sends JSON. Another site can't send this content type
	// without a CORS preflight, so this also keeps cross-site requests out.
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		return new Response('Unsupported Media Type', { status: 415 });
	}
	// SvelteKit's server-side fetch sends no Sec-Fetch-Site; a browser fetch from
	// the app sends `same-origin`. Requests from other sites can't read the
	// response anyway, but have no reason to reach the endpoint.
	const site = request.headers.get('sec-fetch-site');
	if (site !== null && site !== 'same-origin') {
		return new Response('Forbidden', { status: 403 });
	}

	let name: string;
	let args: Value;
	try {
		const body = (await request.json()) as Partial<HydrationRequestBody>;
		if (typeof body.name !== 'string' || !isFunctionName(body.name)) {
			throw new Error();
		}
		if (typeof body.args !== 'object' || body.args === null || Array.isArray(body.args)) {
			throw new Error();
		}
		name = body.name;
		args = jsonToConvex(body.args);
	} catch {
		return new Response('Bad Request', { status: 400 });
	}

	warnIfOutsideAuth();
	const client = new ConvexHttpClient(getConvexUrl());
	const token = _getServerToken();
	if (token) client.setAuth(token);

	let body: HydrationResponseBody;
	try {
		// `/api/query` only runs public query functions: Convex rejects
		// mutations, actions and internal functions here.
		const value = await client.query(makeFunctionReference<'query'>(name), args as never);
		body = { value: convexToJson(value as Value) };
	} catch (error) {
		// Same information convexLoad would throw when querying directly.
		body = {
			error:
				error instanceof ConvexError
					? { message: error.message, data: convexToJson(error.data as Value) as JSONValue }
					: { message: error instanceof Error ? error.message : String(error) }
		};
	}
	// 200 also for query errors: SvelteKit replays the response either way, and
	// convexLoad rethrows the error from the body.
	return Response.json(body, {
		headers: { 'cache-control': 'private, no-store' }
	});
}

let warnedOutsideAuth = false;

/**
 * Dev only: the app uses `withServerConvexToken`, but this request runs
 * outside it — the handle comes before the auth handle, so queries would run
 * signed out.
 */
function warnIfOutsideAuth(): void {
	if (!DEV || warnedOutsideAuth) return;
	const context = _serverTokenContext();
	if (context.inside || !context.used) return;
	warnedOutsideAuth = true;
	console.warn(
		'[convex-svelte] convexLoadHydration runs before withServerConvexToken, so its queries ' +
			'run without auth. Place it after your auth handle: ' +
			'`export const handle = sequence(convexAuth, convexLoadHydration)`.'
	);
}
