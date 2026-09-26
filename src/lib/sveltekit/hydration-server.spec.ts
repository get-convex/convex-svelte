import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';

// ---------------------------------------------------------------------------
// Tests for the convexLoadHydration handle together with the real server path
// of convexLoad / convexLoadPaginated (SERVER environment, no document).
// ---------------------------------------------------------------------------

const { mockHttpClientQuery, kit } = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	delete (globalThis as any)['document'];
	return { mockHttpClientQuery: vi.fn(), kit: { inUniversalLoad: true } };
});

// SvelteKit sets `state.is_in_universal_load` in the request store while a
// universal load runs on the server; simulated here.
vi.mock('@sveltejs/kit/internal/server', () => ({
	try_get_request_store: () => ({ state: { is_in_universal_load: kit.inUniversalLoad } })
}));

vi.mock('convex/browser', () => ({
	ConvexHttpClient: class {
		query = mockHttpClientQuery;
		setAuth() {}
	}
}));

vi.mock('../internal/singleton.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../internal/singleton.js')>()),
	getConvexUrl: () => 'https://test.convex.cloud',
	_getServerToken: () => undefined
}));

// The real module needs SvelteKit's `$app/state`; unused on the server.
vi.mock('./route-data.svelte.js', () => ({ createRouteQuery: vi.fn() }));

import { makeFunctionReference } from 'convex/server';
import { convexLoadHydration } from './hydration-server.js';
import { convexLoad, convexLoadPaginated } from './transport.svelte.js';

const listRef = makeFunctionReference<'query'>('messages:list');
const pageRef = makeFunctionReference<'query'>('messages:paginatedList');
const TEMPLATE = '<html><head></head><body><div>app</div></body></html>';

/**
 * Run a request through the handle. `render` plays SvelteKit: it runs the
 * loads inside `resolve`, then the page HTML goes through transformPageChunk.
 */
async function renderPage(render: () => Promise<void>): Promise<string> {
	let html = '';
	await convexLoadHydration({
		event: {} as RequestEvent,
		resolve: async (_event: RequestEvent, options?: ResolveOptions) => {
			await render();
			html = (await options?.transformPageChunk?.({ html: TEMPLATE, done: true })) ?? TEMPLATE;
			return new Response(html);
		}
	});
	return html;
}

/** Run load code as a universal load (+page.ts) or as a server load (+page.server.ts). */
async function universalLoad(fn: () => Promise<unknown>) {
	kit.inUniversalLoad = true;
	await fn();
}
async function serverLoad(fn: () => Promise<unknown>) {
	kit.inUniversalLoad = false;
	try {
		await fn();
	} finally {
		kit.inUniversalLoad = true;
	}
}

/** The embedded payload of a rendered page, or `undefined`. */
function payloadOf(html: string): Record<string, unknown> | undefined {
	const json = html.match(/<script [^>]*data-convex-load>(.*?)<\/script>/)?.[1];
	return json === undefined ? undefined : (JSON.parse(json) as Record<string, unknown>);
}

describe('convexLoadHydration', () => {
	it('embeds convexLoad results of universal loads, keyed by query and args', async () => {
		mockHttpClientQuery.mockResolvedValueOnce([{ body: 'hi' }]);

		const html = await renderPage(async () => {
			await convexLoad(listRef, { muteWords: [] });
		});

		expect(payloadOf(html)).toEqual({ 'messages:list|{"muteWords":[]}': [{ body: 'hi' }] });
	});

	it('embeds the first page of convexLoadPaginated, keyed with the page size', async () => {
		const page = { page: [{ id: 1 }], isDone: false, continueCursor: 'c' };
		mockHttpClientQuery.mockResolvedValueOnce(page);

		const html = await renderPage(async () => {
			await convexLoadPaginated(pageRef, { searchWords: [] }, { initialNumItems: 5 });
		});

		expect(payloadOf(html)).toEqual({
			'paginated|messages:paginatedList|{"searchWords":[]}|5': page
		});
	});

	it('does not embed results that are opted out with hydrate: false', async () => {
		mockHttpClientQuery.mockResolvedValue([]);

		const html = await renderPage(async () => {
			await convexLoad(listRef, {}, { hydrate: false });
			await convexLoadPaginated(pageRef, {}, { initialNumItems: 5, hydrate: false });
		});

		expect(payloadOf(html)).toEqual({});
	});

	it('never embeds server-load results, not even ones the load does not return', async () => {
		// A +page.server.ts load may fetch private data and return only part of
		// it (or a token-privileged result): that must never reach the HTML.
		mockHttpClientQuery.mockResolvedValue({ displayName: 'Ada', email: 'private@example.com' });

		const html = await renderPage(() =>
			serverLoad(async () => {
				const account = await convexLoad(listRef, { account: true });
				void account.data?.displayName;
				await convexLoadPaginated(pageRef, {}, { initialNumItems: 5 });
			})
		);

		expect(payloadOf(html)).toEqual({});
		expect(html).not.toContain('private@example.com');
	});

	it('embeds a universal result even when a server load fetched the same query', async () => {
		mockHttpClientQuery.mockResolvedValue(['same']);

		const html = await renderPage(async () => {
			await universalLoad(() => convexLoad(listRef, {}));
			await serverLoad(() => convexLoad(listRef, {}));
		});

		expect(payloadOf(html)).toEqual({ 'messages:list|{}': ['same'] });
	});

	it('keeps concurrent requests apart', async () => {
		mockHttpClientQuery.mockImplementation(async (_ref, args: { request: string }) => {
			await new Promise((resolve) => setTimeout(resolve, args.request === 'a' ? 20 : 0));
			return args.request;
		});

		const [a, b] = await Promise.all([
			renderPage(async () => {
				await convexLoad(listRef, { request: 'a' });
			}),
			renderPage(async () => {
				await convexLoad(listRef, { request: 'b' });
			})
		]);

		expect(payloadOf(a)).toEqual({ 'messages:list|{"request":"a"}': 'a' });
		expect(payloadOf(b)).toEqual({ 'messages:list|{"request":"b"}': 'b' });
	});

	it("places the payload in <head>, before SvelteKit's start script in <body>", async () => {
		mockHttpClientQuery.mockResolvedValueOnce([]);

		const html = await renderPage(async () => {
			await convexLoad(listRef, {});
		});

		expect(html.indexOf('data-convex-load')).toBeLessThan(html.indexOf('</head>'));
	});

	it('does nothing outside the handle', async () => {
		mockHttpClientQuery.mockResolvedValueOnce([]);

		// Without the handle, convexLoad still works; there is just no payload.
		await expect(convexLoad(listRef, {})).resolves.toBeDefined();
	});
});

describe('convexLoadHydration — SvelteKit without the universal-load marker', () => {
	it.each([
		['older than 2.31 exports (accessor missing)', { try_get_request_store: undefined }],
		['2.31–2.55 (store without the marker)', { try_get_request_store: () => ({ state: {} }) }],
		[
			'a throwing accessor',
			{
				try_get_request_store: () => {
					throw new Error('internal error');
				}
			}
		]
	])('embeds nothing (fail-safe) and warns once: %s', async (_name, internal) => {
		vi.resetModules();
		vi.doMock('@sveltejs/kit/internal/server', () => internal);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { convexLoadHydration: handle } = await import('./hydration-server.js');
		const transport = await import('./transport.svelte.js');
		mockHttpClientQuery.mockResolvedValue(['x']);

		let html = '';
		for (let i = 0; i < 2; i++) {
			await handle({
				event: {} as RequestEvent,
				resolve: async (_event: RequestEvent, options?: ResolveOptions) => {
					await transport.convexLoad(listRef, {});
					html = (await options?.transformPageChunk?.({ html: TEMPLATE, done: true })) ?? '';
					return new Response(html);
				}
			});
		}

		expect(payloadOf(html)).toEqual({});
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain('SvelteKit 2.56');
		warn.mockRestore();
		vi.doUnmock('@sveltejs/kit/internal/server');
	});

	it('does not warn when the marker is present', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		mockHttpClientQuery.mockResolvedValueOnce([]);

		await renderPage(async () => {
			await convexLoad(listRef, {});
		});

		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
