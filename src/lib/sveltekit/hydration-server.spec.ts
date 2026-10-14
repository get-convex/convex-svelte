import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

// ---------------------------------------------------------------------------
// Tests for the convexLoadHydration endpoint (hydration-server.ts) and the
// server path of convexLoad / convexLoadPaginated through it (SERVER
// environment, no document). The endpoint runs Convex queries on the user's
// behalf, so its input checks and response headers are part of the contract.
// ---------------------------------------------------------------------------

const { mockQuery, mockSetAuth, env } = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	delete (globalThis as any)['document'];
	return { mockQuery: vi.fn(), mockSetAuth: vi.fn(), env: { dev: true } };
});

vi.mock('esm-env', async (importOriginal) => ({
	...(await importOriginal<typeof import('esm-env')>()),
	get DEV() {
		return env.dev;
	}
}));

vi.mock('convex/browser', () => ({
	ConvexHttpClient: class {
		query = mockQuery;
		setAuth = mockSetAuth;
	}
}));

vi.mock('../internal/singleton.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../internal/singleton.js')>()),
	getConvexUrl: () => 'https://test.convex.cloud'
}));

// The real module needs SvelteKit's `$app/state`; unused on the server.
vi.mock('./route-data.svelte.js', () => ({ createRouteQuery: vi.fn() }));

import { getFunctionName, makeFunctionReference } from 'convex/server';
import { ConvexError, convexToJson } from 'convex/values';
import { convexLoadHydration } from './hydration-server.js';
import { queryThroughHydration } from './hydration.js';

import { withServerConvexToken } from './server-token.js';
import { convexLoad, convexLoadPaginated, ConvexLoadResult } from './transport.svelte.js';

const ORIGIN = 'http://localhost';
const PAGE = `${ORIGIN}/some/page`;
/** An endpoint pathname, as convexLoad builds it (`/__convex-svelte/q/<hash>`). */
const ENDPOINT = '/__convex-svelte/q/1a2b3c';

/** Run a request through the handle; anything but the endpoint resolves to "page". */
function handle(request: Request) {
	return convexLoadHydration({
		event: { url: new URL(request.url), request } as RequestEvent,
		resolve: async () => new Response('page')
	});
}

function queryRequest(body: unknown, headers: Record<string, string> = {}, base = '') {
	return new Request(`${ORIGIN}${base}${ENDPOINT}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

/**
 * Plays SvelteKit's server-side `fetch` in a universal load: a same-origin
 * request goes through the app's handle chain (here: auth, then hydration).
 */
function kitFetch(token: string | undefined): typeof globalThis.fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) =>
		withServerConvexToken(token, () =>
			// Relative URLs resolve against the page, like SvelteKit's fetch does.
			handle(new Request(new URL(String(input), PAGE), init))
		)) as typeof globalThis.fetch;
}

afterEach(() => {
	mockQuery.mockReset();
	mockSetAuth.mockReset();
	vi.restoreAllMocks();
	env.dev = true;
});

describe('convexLoadHydration — endpoint', () => {
	it('passes everything else through to the app, also GETs to an endpoint path', async () => {
		for (const request of [
			new Request(PAGE),
			new Request(PAGE, { method: 'POST', body: 'form' }),
			new Request(`${ORIGIN}${ENDPOINT}`),
			new Request(`${ORIGIN}/__convex-svelte/q/`, { method: 'POST', body: '{}' })
		]) {
			expect(await (await handle(request)).text()).toBe('page');
		}
		expect(mockQuery).not.toHaveBeenCalled();
	});

	it('runs the query with the token from withServerConvexToken', async () => {
		mockQuery.mockResolvedValue({ count: 9007199254740993n });

		const response = await withServerConvexToken('jwt', () =>
			handle(queryRequest({ name: 'messages:list', args: { a: 1 } }))
		);

		expect(mockSetAuth).toHaveBeenCalledWith('jwt');
		expect(getFunctionName(mockQuery.mock.calls[0][0])).toBe('messages:list');
		expect(mockQuery.mock.calls[0][1]).toEqual({ a: 1 });
		expect(await response.json()).toEqual({
			value: convexToJson({ count: 9007199254740993n })
		});
	});

	it('marks responses as private and uncacheable', async () => {
		mockQuery.mockResolvedValue(null);

		const response = await handle(queryRequest({ name: 'messages:list', args: {} }));

		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('returns query errors in the body: ConvexError with its data, others with the message', async () => {
		mockQuery.mockRejectedValueOnce(new ConvexError({ code: 'FORBIDDEN' }));
		const convexError = await handle(queryRequest({ name: 'messages:list', args: {} }));
		expect(await convexError.json()).toEqual({
			error: { message: expect.any(String), data: { code: 'FORBIDDEN' } }
		});

		mockQuery.mockRejectedValueOnce(new Error('[Request ID: x] Server Error'));
		const serverError = await handle(queryRequest({ name: 'messages:list', args: {} }));
		expect(await serverError.json()).toEqual({
			error: { message: '[Request ID: x] Server Error' }
		});
	});

	it('only accepts JSON (no simple cross-site request can send it)', async () => {
		const response = await handle(
			queryRequest(
				{ name: 'messages:list', args: {} },
				{
					'content-type': 'text/plain;charset=UTF-8'
				}
			)
		);

		expect(response.status).toBe(415);
		expect(mockQuery).not.toHaveBeenCalled();
	});

	it('rejects requests from other sites, but not same-origin ones or SvelteKit itself', async () => {
		mockQuery.mockResolvedValue(null);
		const body = { name: 'messages:list', args: {} };

		for (const site of ['cross-site', 'same-site', 'none']) {
			const response = await handle(queryRequest(body, { 'sec-fetch-site': site }));
			expect(response.status).toBe(403);
		}
		const sameOrigin = await handle(queryRequest(body, { 'sec-fetch-site': 'same-origin' }));
		expect(sameOrigin.status).toBe(200);
		expect((await handle(queryRequest(body))).status).toBe(200);
	});

	it.each([
		['malformed JSON', '{not json'],
		['a missing name', { args: {} }],
		['a .. path component', { name: '../secrets:get', args: {} }],
		['two colons', { name: 'a:b:c', args: {} }],
		['a hyphen, which Convex rejects', { name: 'my-module:list', args: {} }],
		['args that are not an object', { name: 'messages:list', args: [1] }],
		['missing args', { name: 'messages:list' }],
		['args that are not Convex JSON', { name: 'messages:list', args: { x: { $weird: 1 } } }]
	])('rejects %s with 400, without querying', async (_case, body) => {
		const response = await handle(queryRequest(body));

		expect(response.status).toBe(400);
		expect(mockQuery).not.toHaveBeenCalled();
	});

	it('reads the request URL, not event.url (SvelteKit restricts it on prerendered pages)', async () => {
		mockQuery.mockResolvedValue(['prerendered']);
		const request = queryRequest({ name: 'messages:list', args: {} });
		const url = new URL(request.url);
		// SvelteKit's prerendering guards url.searchParams like this.
		Object.defineProperty(url, 'searchParams', {
			get() {
				throw new Error('Cannot access url.searchParams on a page with prerendering enabled');
			}
		});

		const response = await convexLoadHydration({
			event: { url, request } as RequestEvent,
			resolve: async () => new Response('page')
		});

		expect(await response.json()).toEqual({ value: ['prerendered'] });
	});

	it('serves the endpoint below a base path (kit.paths.base)', async () => {
		mockQuery.mockResolvedValue(['x']);

		const response = await handle(queryRequest({ name: 'messages:list', args: {} }, {}, '/app'));

		expect(await response.json()).toEqual({ value: ['x'] });
	});

	it('accepts module paths and default exports', async () => {
		mockQuery.mockResolvedValue(null);

		for (const name of ['folder/messages:list', 'messages', 'api.v1/messages.js:list']) {
			const response = await handle(queryRequest({ name, args: {} }));
			expect(response.status).toBe(200);
		}
	});
});

describe('convexLoad / convexLoadPaginated on the server with { fetch }', () => {
	const listRef = makeFunctionReference<'query'>('messages:list');
	const pageRef = makeFunctionReference<'query'>('messages:paginatedList');

	it('queries through the endpoint with the request token, returning a transport result', async () => {
		mockQuery.mockResolvedValue(['a', 'b']);

		const result = await convexLoad(listRef, { channel: 'x' }, { fetch: kitFetch('jwt') });

		expect(result).toBeInstanceOf(ConvexLoadResult);
		expect(result.data).toEqual(['a', 'b']);
		expect(mockQuery).toHaveBeenCalledOnce();
		expect(mockQuery.mock.calls[0][1]).toEqual({ channel: 'x' });
		expect(mockSetAuth).toHaveBeenCalledWith('jwt');
	});

	it('rethrows the query error from the endpoint', async () => {
		mockQuery.mockRejectedValue(new ConvexError('not allowed'));

		await expect(convexLoad(listRef, {}, { fetch: kitFetch('jwt') })).rejects.toBeInstanceOf(
			ConvexError
		);
	});

	it('sends the first page args, with the page size, for convexLoadPaginated', async () => {
		const page = { page: [1], isDone: true, continueCursor: 'c' };
		mockQuery.mockResolvedValue(page);

		const result = await convexLoadPaginated(
			pageRef,
			{ q: '' },
			{ initialNumItems: 5, fetch: kitFetch(undefined) }
		);

		expect(mockQuery.mock.calls[0][1]).toEqual({
			q: '',
			paginationOpts: { numItems: 5, cursor: null }
		});
		expect(result.results).toEqual([1]);
	});

	it('requests the same endpoint path as the browser on the same page', async () => {
		const urls: string[] = [];
		const record = vi.fn(async (input: RequestInfo | URL) => {
			urls.push(String(input));
			return Response.json({ value: null });
		});

		// Server: the load runs inside the handle, rendering /some/page.
		await convexLoadHydration({
			event: { url: new URL(PAGE), request: new Request(PAGE) } as RequestEvent,
			resolve: async () => {
				await convexLoad(listRef, { a: 1 }, { fetch: record });
				return new Response('page');
			}
		});
		// Browser: hydrating /some/page.
		vi.stubGlobal('location', { pathname: '/some/page' });
		await queryThroughHydration(record, 'messages:list', { a: 1 });
		vi.unstubAllGlobals();

		const [server, browser] = urls.map((url) => url.slice(url.lastIndexOf('/')));
		expect(server).toBe(browser);
	});

	it('queries directly with an explicit token, bypassing fetch', async () => {
		mockQuery.mockResolvedValue([]);
		const fetch = vi.fn();

		await convexLoad(listRef, {}, { fetch, token: 'explicit' });

		expect(fetch).not.toHaveBeenCalled();
		expect(mockSetAuth).toHaveBeenCalledWith('explicit');
	});

	it("keeps token: '' signed out, also inside withServerConvexToken", async () => {
		mockQuery.mockResolvedValue([]);
		const fetch = vi.fn();

		await withServerConvexToken('ambient', () => convexLoad(listRef, {}, { fetch, token: '' }));

		expect(fetch).not.toHaveBeenCalled();
		expect(mockSetAuth).not.toHaveBeenCalled();
	});

	it('queries directly when the handle is missing', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		mockQuery.mockResolvedValue(['direct']);
		const fetchWithoutHandle = vi.fn(async () => new Response('Not Found', { status: 404 }));

		const result = await convexLoad(listRef, {}, { fetch: fetchWithoutHandle });

		expect(result.data).toEqual(['direct']);
		expect(mockQuery).toHaveBeenCalledOnce();
	});
});

// Last: it resets the module registry, which re-registers the server token getter.
describe('convexLoadHydration — handle order (dev)', () => {
	it('warns once when it runs outside withServerConvexToken although the app uses it', async () => {
		vi.resetModules();
		const { convexLoadHydration: freshHandle } = await import('./hydration-server.js');
		const { withServerConvexToken: freshWithToken } = await import('./server-token.js');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		mockQuery.mockResolvedValue(null);
		const run = () =>
			freshHandle({
				event: {
					url: new URL(`${ORIGIN}${ENDPOINT}`),
					request: queryRequest({ name: 'messages:list', args: {} })
				} as RequestEvent,
				resolve: async () => new Response('page')
			});

		// Before the app ever used withServerConvexToken: no auth in this app.
		await run();
		expect(warn).not.toHaveBeenCalled();

		// Inside it: correct order.
		await freshWithToken('jwt', run);
		expect(warn).not.toHaveBeenCalled();

		// Outside it, after the app used it: handle placed before the auth handle.
		await run();
		await run();
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain('sequence(convexAuth, convexLoadHydration)');
		warn.mockRestore();
	});
});
