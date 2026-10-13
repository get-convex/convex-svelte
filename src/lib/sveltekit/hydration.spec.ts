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
	HYDRATION_URL,
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
	it('POSTs the function name and Convex JSON args as JSON to the page-relative endpoint', async () => {
		const fetch = endpointFetch({ value: null });

		await queryThroughHydration(fetch, 'messages:list', { count: 9007199254740993n });

		// Relative to the page, so inside any base path, for page and data requests.
		expect(HYDRATION_URL).toBe('?__convex-svelte=query');
		expect(fetch).toHaveBeenCalledWith(HYDRATION_URL, {
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

	it('returns the value, round-tripping Convex types', async () => {
		const value = { count: 9007199254740993n, nested: [{ a: null }] };
		const fetch = endpointFetch({ value: convexToJson(value) });

		await expect(queryThroughHydration(fetch, 'messages:list', {})).resolves.toEqual({ value });
	});

	it('rethrows a query error, as a ConvexError with its data when there is data', async () => {
		const plain = endpointFetch({ error: { message: 'boom' } });
		await expect(queryThroughHydration(plain, 'messages:list', {})).rejects.toThrow('boom');

		const withData = endpointFetch({
			error: { message: 'not allowed', data: convexToJson({ code: 'FORBIDDEN' }) }
		});
		const error = await queryThroughHydration(withData, 'messages:list', {}).catch((e) => e);
		expect(error).toBeInstanceOf(ConvexError);
		expect(error.data).toEqual({ code: 'FORBIDDEN' });
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
