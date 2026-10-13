import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConvexError, convexToJson } from 'convex/values';

// ---------------------------------------------------------------------------
// Tests for the client side of convexLoad hydration (hydration.ts): the
// request convexLoad sends through the load's fetch, and how it reads the
// endpoint's response. The request must be identical on the server and in the
// browser, so SvelteKit can replay the server's response during hydration.
// ---------------------------------------------------------------------------

const env = vi.hoisted(() => ({ dev: true }));
vi.mock('esm-env', () => ({
	get DEV() {
		return env.dev;
	}
}));

import {
	HYDRATION_PATHNAME,
	_resetHydrationWarnings,
	queryThroughHydration,
	warnMissingFetch
} from './hydration.js';

/**
 * A load fetch that answers like the endpoint, or like SvelteKit without the
 * handle (a 404 page). Like a response SvelteKit replays, it has no headers.
 */
function endpointFetch(body: unknown, { handle = true } = {}) {
	return vi.fn(
		async () =>
			new Response(handle ? JSON.stringify(body) : '<!doctype html><h1>404</h1>', {
				status: handle ? 200 : 404
			})
	);
}

afterEach(() => {
	env.dev = true;
	_resetHydrationWarnings();
	vi.restoreAllMocks();
});

describe('queryThroughHydration', () => {
	it('POSTs the function name and Convex JSON args as JSON to the endpoint', async () => {
		const fetch = endpointFetch({ value: null });

		await queryThroughHydration(fetch, 'messages:list', { count: 9007199254740993n });

		expect(fetch).toHaveBeenCalledWith(expect.stringMatching(HYDRATION_PATHNAME), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: 'messages:list',
				args: convexToJson({ count: 9007199254740993n })
			})
		});
	});

	it('sends the identical request every time (what SvelteKit matches for the replay)', async () => {
		const fetch = endpointFetch({ value: null });

		await queryThroughHydration(fetch, 'messages:list', { a: 1, b: [true] });
		await queryThroughHydration(fetch, 'messages:list', { a: 1, b: [true] });

		expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
	});

	it('gives every query and args its own pathname (prerendering writes one file per path)', async () => {
		const fetch = endpointFetch({ value: null });

		await queryThroughHydration(fetch, 'messages:list', { a: 1 });
		await queryThroughHydration(fetch, 'messages:list', { a: 2 });
		await queryThroughHydration(fetch, 'users:get', { a: 1 });
		await queryThroughHydration(fetch, 'messages:list', { a: 1 });

		const urls = fetch.mock.calls.map((call) => (call as unknown[])[0]);
		expect(new Set(urls.slice(0, 3)).size).toBe(3);
		expect(urls[3]).toBe(urls[0]);
		for (const url of urls) expect(url).toMatch(/^\/__convex-svelte\/q\/[0-9a-z]+$/);
	});

	it('gives the same query on another page another pathname (prerendered pages write files)', async () => {
		const fetch = endpointFetch({ value: null });

		vi.stubGlobal('location', { pathname: '/prerendered' });
		await queryThroughHydration(fetch, 'messages:list', { a: 1 });
		vi.stubGlobal('location', { pathname: '/dynamic' });
		await queryThroughHydration(fetch, 'messages:list', { a: 1 });
		vi.unstubAllGlobals();

		const [first, second] = fetch.mock.calls.map((call) => (call as unknown[])[0]);
		expect(first).not.toBe(second);
	});

	it('queries directly (returns undefined) when the request fails, e.g. a network error', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const failing = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});

		await expect(queryThroughHydration(failing, 'messages:list', {})).resolves.toBeUndefined();
	});

	it('returns the value, round-tripping Convex types', async () => {
		const value = { count: 9007199254740993n, nested: [{ a: null }] };
		const fetch = endpointFetch({ value: convexToJson(value) });

		await expect(queryThroughHydration(fetch, 'messages:list', {})).resolves.toEqual({ value });
	});

	it('rethrows a query error, as a ConvexError with its data when there is data', async () => {
		const plain = endpointFetch({ error: { message: 'boom' } });
		await expect(queryThroughHydration(plain, 'messages:list', {})).rejects.toThrow('boom');

		const withData = endpointFetch({
			error: {
				message: '[Request ID: abc] Server Error\nUncaught ConvexError: not allowed',
				data: convexToJson({ code: 'FORBIDDEN' })
			}
		});
		const error = await queryThroughHydration(withData, 'messages:list', {}).catch((e) => e);
		expect(error).toBeInstanceOf(ConvexError);
		expect(error.data).toEqual({ code: 'FORBIDDEN' });
		// The server's message survives, like with ConvexHttpClient.
		expect(error.message).toBe('[Request ID: abc] Server Error\nUncaught ConvexError: not allowed');
	});

	it('accepts a replayed response, which has no headers', async () => {
		const replayed = vi.fn(async () => new Response(JSON.stringify({ value: [1] })));

		await expect(queryThroughHydration(replayed, 'messages:list', {})).resolves.toEqual({
			value: [1]
		});
	});

	it('returns undefined for a JSON response that is not from the endpoint', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const other = vi.fn(async () => new Response(JSON.stringify({ unrelated: true })));

		await expect(queryThroughHydration(other, 'messages:list', {})).resolves.toBeUndefined();
	});

	it('returns undefined and warns once in dev when the handle is missing', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetch = endpointFetch('Not Found', { handle: false });

		await expect(queryThroughHydration(fetch, 'messages:list', {})).resolves.toBeUndefined();
		await queryThroughHydration(fetch, 'messages:list', {});

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain('convexLoadHydration');
	});
});

describe('warnMissingFetch', () => {
	it('warns once per query in dev, with the fix', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		warnMissingFetch('messages:list');
		warnMissingFetch('messages:list');
		warnMissingFetch('users:get');

		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[0][0]).toContain('{ fetch }');
	});

	it('stays quiet in production', () => {
		env.dev = false;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		warnMissingFetch('messages:list');

		expect(warn).not.toHaveBeenCalled();
	});
});

describe('queryThroughHydration — base path (kit.paths.base)', () => {
	async function endpointUrlWith(pathsModule: Record<string, unknown>) {
		vi.resetModules();
		vi.doMock('$app/paths', () => pathsModule);
		const hydration = await import('./hydration.js');
		const fetch = vi.fn(async () => new Response(JSON.stringify({ value: null })));
		await hydration.queryThroughHydration(fetch, 'messages:list', {});
		vi.doUnmock('$app/paths');
		return (fetch.mock.calls[0] as unknown[])[0] as string;
	}

	it('uses resolve() where SvelteKit has it (2.26+ and 3)', async () => {
		const url = await endpointUrlWith({
			resolve: (path: string) => `/app${path}`,
			asset: () => ''
		});

		expect(url).toMatch(/^\/app\/__convex-svelte\/q\/[0-9a-z]+$/);
	});

	it('falls back to base before SvelteKit 2.26', async () => {
		// `resolve: undefined` stands in for the missing export: vitest's module
		// mocks throw on undefined exports, real module namespaces don't.
		expect(await endpointUrlWith({ base: '/app', assets: '', resolve: undefined })).toMatch(
			/^\/app\/__convex-svelte\/q\//
		);
		// Relative paths: SvelteKit makes base relative to the page during SSR.
		expect(await endpointUrlWith({ base: '..', assets: '', resolve: undefined })).toMatch(
			/^\.\.\/__convex-svelte\/q\//
		);
	});
});
