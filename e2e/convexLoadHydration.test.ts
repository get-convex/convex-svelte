import { expect, test } from '@playwright/test';
import { convexUrl, recordWebSocket, withMuteWord } from './helpers/websocket.js';

// ---------------------------------------------------------------------------
// convexLoad SSR hydration payload (convexLoadHydration handle in
// src/hooks.server.ts).
//
// SvelteKit re-runs universal loads (+page.ts) in the browser during
// hydration — before setupAuth() authenticated the client. They must reuse
// the server's results instead of querying unauthenticated, and open exactly
// one live subscription each.
// ---------------------------------------------------------------------------

test.describe('convexLoad — SSR hydration payload', () => {
	test('embeds results of universal loads in the HTML', async ({ page }) => {
		const response = await page.goto('/tests/convex-load-release/a');
		const html = (await response?.text()) ?? '';

		expect(html).toContain('data-convex-load');
		expect(html).toContain('__e2e_release_a__');
		// In <head>, so it exists before SvelteKit's start script runs the loads.
		expect(html.indexOf('data-convex-load')).toBeLessThan(html.indexOf('</head>'));
	});

	test('never embeds server-load results (returned ones use the transport)', async ({ page }) => {
		const websocket = recordWebSocket(page);
		const response = await page.goto('/tests/convex-load-server');
		const html = (await response?.text()) ?? '';

		// The handle marks the page with an (empty) payload…
		expect(html).toContain('data-convex-load>{}<');
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

		expect(html).toContain('__e2e_nested_layout__');
		expect(html).toContain('__e2e_nested_page__');
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
			expect(await response?.text()).toContain('data-convex-load');
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
