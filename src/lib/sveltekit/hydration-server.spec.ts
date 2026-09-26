import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';

// ---------------------------------------------------------------------------
// Tests for the convexLoadHydration handle together with the real server path
// of convexLoad / convexLoadPaginated (SERVER environment, no document).
// ---------------------------------------------------------------------------

const { mockHttpClientQuery } = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	delete (globalThis as any)['document'];
	return { mockHttpClientQuery: vi.fn() };
});

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
import {
	convexLoad,
	convexLoadPaginated,
	encodeConvexLoad,
	encodeConvexLoadPaginated
} from './transport.svelte.js';

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
		expect(html.indexOf('data-convex-load')).toBeLessThan(html.indexOf('</body>'));
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

		expect(payloadOf(html)).toBeUndefined();
		expect(html).toBe(TEMPLATE);
	});

	it('does not embed server-load results again (they go through the transport)', async () => {
		mockHttpClientQuery.mockResolvedValue([]);

		const html = await renderPage(async () => {
			// +page.server.ts: SvelteKit serializes the result with the transport
			// hook before transforming the page HTML.
			encodeConvexLoad(await convexLoad(listRef, { server: true }));
			encodeConvexLoadPaginated(await convexLoadPaginated(pageRef, {}, { initialNumItems: 5 }));
			// +page.ts: not serialized, re-runs in the browser.
			await convexLoad(listRef, { universal: true });
		});

		expect(Object.keys(payloadOf(html) ?? {})).toEqual(['messages:list|{"universal":true}']);
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

	it('does nothing outside the handle', async () => {
		mockHttpClientQuery.mockResolvedValueOnce([]);

		// Without the handle, convexLoad still works; there is just no payload.
		await expect(convexLoad(listRef, {})).resolves.toBeDefined();
	});
});
