import { expect, test } from '@playwright/test';
import { convexUrl, recordWebSocket, withMuteWord, type QueryEvent } from './helpers/websocket.js';

// ---------------------------------------------------------------------------
// convexLoad hydration via SvelteKit's fetch replay (convexLoad({ fetch }) in
// universal loads, convexLoadHydration handle in src/hooks.server.ts).
//
// SvelteKit re-runs universal loads (+page.ts) in the browser during
// hydration — before setupAuth() authenticated the client. They must reuse
// the server's results instead of querying unauthenticated, and open exactly
// one live subscription each.
// ---------------------------------------------------------------------------

// Endpoint requests: one pathname per page, query and args (/__convex-svelte/q/<hash>).
const MARKER = '/__convex-svelte/q/';
const RECORDED = /data-sveltekit-fetched data-url="[^"]*\/__convex-svelte\/q\/[0-9a-z]+"/g;

test.describe('convexLoad — hydration via fetch replay', () => {
	test('SvelteKit records the endpoint responses of universal loads in the HTML', async ({
		page
	}) => {
		const response = await page.goto('/tests/convex-load-release/a');
		const html = (await response?.text()) ?? '';

		// One recorded response for the page's one universal convexLoad.
		expect(html.match(RECORDED)).toHaveLength(1);
	});

	test('hydration makes no request to the endpoint', async ({ page }) => {
		const requests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes(MARKER)) requests.push(request.url());
		});
		await page.goto('/tests/convex-load-nested');
		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });

		expect(requests).toEqual([]);
	});

	test('never embeds server-load results (returned ones use the transport)', async ({ page }) => {
		const websocket = recordWebSocket(page);
		const response = await page.goto('/tests/convex-load-server');
		const html = (await response?.text()) ?? '';

		// SvelteKit records no fetch of a server load…
		expect(html).not.toContain(MARKER);
		// …and a result the server load only used internally never appears.
		expect(html).not.toContain('__e2e_server_private__');
		// Still rendered from SSR and upgraded to a live subscription.
		await expect(page.getByTestId('data')).toBeVisible();
		await expect(page.getByTestId('hydrated')).toContainText('true');
		await expect
			.poll(() => websocket.queryEvents(withMuteWord('__e2e_server_load__')).length)
			.toBe(1);
	});

	test('hydration never queries before auth is set up', async ({ page }) => {
		const websocket = recordWebSocket(page);
		await page.goto('/tests/convex-load-auth');
		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 10000 });
		// SSR data is shown right away — no loading state after hydration either.
		await expect(page.getByTestId('data')).toBeVisible();
		await expect(page.getByTestId('loading')).not.toBeVisible();
		await expect.poll(() => websocket.events.some((e) => e.type === 'Authenticate')).toBe(true);
		await expect
			.poll(() => websocket.queryEvents(withMuteWord('__e2e_auth_hydration__')).length)
			.toBeGreaterThan(0);

		const firstAuthenticate = websocket.events.findIndex((e) => e.type === 'Authenticate');
		const firstQuery = websocket.events.findIndex(
			(e) => e.type !== 'Authenticate' && withMuteWord('__e2e_auth_hydration__')(e)
		);
		expect(firstQuery).toBeGreaterThan(firstAuthenticate);
	});

	test('hydration opens exactly one subscription per query', async ({ page }) => {
		const websocket = recordWebSocket(page);
		await page.goto('/tests/convex-load-release/a');
		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });
		await expect
			.poll(() => websocket.queryEvents(withMuteWord('__e2e_release_a__')).length)
			.toBe(1);
		await page.waitForTimeout(1000);

		expect(websocket.queryEvents(withMuteWord('__e2e_release_a__')).map((e) => e.type)).toEqual([
			'Add'
		]);
	});

	test('layouts, server layouts and parent(): embeds exactly the universal results', async ({
		page
	}) => {
		const websocket = recordWebSocket(page);
		const response = await page.goto('/tests/convex-load-nested');
		const html = (await response?.text()) ?? '';

		// The universal layout and page loads: one recorded response each. The
		// server layout's private result never appears.
		expect(html.match(RECORDED)).toHaveLength(2);
		expect(html).not.toContain('__e2e_nested_server_private__');

		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });
		await expect(page.getByTestId('layout-data')).toBeVisible();
		await expect(page.getByTestId('data')).toBeVisible();
		await expect
			.poll(() => websocket.queryEvents(withMuteWord('__e2e_nested_page__')).length)
			.toBe(1);
		await page.waitForTimeout(1000);

		// Each universal query: one subscription, no Add/Remove churn.
		for (const marker of ['__e2e_nested_layout__', '__e2e_nested_page__']) {
			expect(websocket.queryEvents(withMuteWord(marker)).map((e) => e.type)).toEqual(['Add']);
		}
	});

	for (const [name, url, predicate] of [
		['convexLoad', '/tests/convex-load-release/a', withMuteWord('__e2e_release_a__')],
		[
			'convexLoadPaginated',
			'/tests/convex-load-paginated',
			(e: QueryEvent) => e.udfPath === 'messages:paginatedList'
		]
	] as const) {
		test(`${name}: no loading state from SSR through hydration and the live subscription`, async ({
			page
		}) => {
			// Watch from the very first byte whether a loading state ever renders.
			await page.addInitScript(() => {
				const w = window as Window & { __sawLoading?: boolean };
				new MutationObserver(() => {
					if (document.querySelector('[data-testid="loading"]')) w.__sawLoading = true;
				}).observe(document, { childList: true, subtree: true });
			});
			const websocket = recordWebSocket(page);

			await page.goto(url);
			await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });
			// The live subscription is up and has delivered its first update.
			await expect.poll(() => websocket.queryEvents(predicate).length).toBe(1);
			await page.waitForTimeout(1000);

			await expect(page.getByTestId('data')).toBeVisible();
			expect(
				await page.evaluate(() => (window as Window & { __sawLoading?: boolean }).__sawLoading)
			).toBeUndefined();
		});
	}

	test('embedded data cannot inject scripts', async ({ page, request }) => {
		const author = '__e2e_hydration_xss__';
		const mutation = (path: string, args: Record<string, string>) =>
			request.post(`${convexUrl()}/api/mutation`, { data: { path, args, format: 'json' } });
		await mutation('messages:send', {
			author,
			body: '</script><script>window.__convexXss = true</script><!--'
		});

		try {
			// /tests/convex-load lists all messages, including the one above.
			const response = await page.goto('/tests/convex-load');
			expect(await response?.text()).toContain('data-sveltekit-fetched');
			await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });
			await expect(page.getByTestId('data')).toBeVisible();

			expect(await page.evaluate(() => 'convexXss' in window || '__convexXss' in window)).toBe(
				false
			);
		} finally {
			await mutation('messages:deleteByAuthor', { author });
		}
	});
});
