import { expect, test, type Page } from '@playwright/test';
import { recordWebSocket, withMuteWord, type QueryEvent } from './helpers/websocket.js';

// ---------------------------------------------------------------------------
// convexLoad subscriptions are route-scoped (issue #57): leaving a route
// releases its queries instead of keeping them subscribed for the life of
// the tab. Asserted on the WebSocket ModifyQuerySet frames the client sends.
// ---------------------------------------------------------------------------

type QueryModification =
	| { type: 'Add'; queryId: number; args: Array<{ muteWords?: string[] }> }
	| { type: 'Remove'; queryId: number };

type SubscriptionEvent = { type: 'Add' | 'Remove'; name: string };

/** Record Add/Remove events for the test pages' queries (`a` / `b`). */
function trackSubscriptions(page: Page) {
	const events: SubscriptionEvent[] = [];
	const nameByQueryId = new Map<number, string>();

	page.on('websocket', (ws) => {
		ws.on('framesent', ({ payload }) => {
			if (typeof payload !== 'string') return;
			const message = JSON.parse(payload) as {
				type: string;
				modifications?: QueryModification[];
			};
			if (message.type !== 'ModifyQuerySet') return;
			for (const modification of message.modifications ?? []) {
				if (modification.type === 'Add') {
					const marker = modification.args[0]?.muteWords?.[0];
					const name = marker?.match(/^__e2e_release_(\w+)__$/)?.[1];
					if (!name) continue;
					nameByQueryId.set(modification.queryId, name);
					events.push({ type: 'Add', name });
				} else {
					const name = nameByQueryId.get(modification.queryId);
					if (name) events.push({ type: 'Remove', name });
				}
			}
		});
	});

	/** Net number of live subscriptions for a page, counting events from `since` on. */
	const liveCount = (name: string, since = 0) =>
		events
			.slice(since)
			.filter((event) => event.name === name)
			.reduce((count, event) => count + (event.type === 'Add' ? 1 : -1), 0);

	return {
		/** Position in the event log, to only look at later events. */
		mark: () => events.length,
		isSubscribed: (name: string) => liveCount(name) > 0,
		eventsSince: (since: number, name: string) =>
			events.slice(since).filter((event) => event.name === name)
	};
}

async function openPage(page: Page, url: string) {
	await page.goto(url);
	await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });
	await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });
}

async function navigateTo(page: Page, name: string) {
	await page.getByTestId('nav-link').click();
	await expect(page.getByTestId('page-name')).toContainText(`page: ${name}`, { timeout: 10000 });
	await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });
}

test.describe('convexLoad — route-scoped subscriptions', () => {
	test('unsubscribes after leaving the route when keepAlive is false', async ({ page }) => {
		const subscriptions = trackSubscriptions(page);
		await openPage(page, '/tests/convex-load-release/a?keepAlive=false');
		await expect.poll(() => subscriptions.isSubscribed('a')).toBe(true);

		await navigateTo(page, 'b');

		await expect.poll(() => subscriptions.isSubscribed('a')).toBe(false);
		expect(subscriptions.isSubscribed('b')).toBe(true);
	});

	test('keeps a query that is in page.data but no longer rendered', async ({ page }) => {
		// With keepAlive disabled, only page.data can keep the query subscribed
		// once no component reads it anymore.
		const subscriptions = trackSubscriptions(page);
		await openPage(page, '/tests/convex-load-release/a?keepAlive=false');
		await expect.poll(() => subscriptions.isSubscribed('a')).toBe(true);
		await page.waitForTimeout(1000);
		const mark = subscriptions.mark();

		await page.getByTestId('toggle-data').click();
		await expect(page.getByTestId('data')).not.toBeVisible();
		await page.waitForTimeout(1000);

		expect(subscriptions.eventsSince(mark, 'a')).toEqual([]);

		// Leaving the route still releases it.
		await page.getByTestId('nav-link').click();
		await expect(page.getByTestId('page-name')).toContainText('page: b', { timeout: 10000 });
		await expect.poll(() => subscriptions.isSubscribed('a')).toBe(false);
	});

	test('keeps the query alive in the idle buffer and reuses it on back navigation', async ({
		page
	}) => {
		const subscriptions = trackSubscriptions(page);
		await openPage(page, '/tests/convex-load-release/a');
		await expect.poll(() => subscriptions.isSubscribed('a')).toBe(true);
		await page.waitForTimeout(1000);
		const mark = subscriptions.mark();

		await navigateTo(page, 'b');
		await page.goBack();
		await expect(page.getByTestId('page-name')).toContainText('page: a', { timeout: 10000 });
		await expect(page.getByTestId('data')).toBeVisible();

		// The original subscription was never removed nor re-added.
		expect(subscriptions.eventsSince(mark, 'a')).toEqual([]);
		expect(subscriptions.isSubscribed('a')).toBe(true);
	});
});

test.describe('convexLoad — one subscription per query', () => {
	test('client-side navigation opens exactly one subscription', async ({ page }) => {
		const websocket = recordWebSocket(page);
		await openPage(page, '/tests/convex-load-release/a');
		const mark = websocket.mark();

		await navigateTo(page, 'b');
		await page.waitForTimeout(1000);

		// Previously: Add (one-shot query) → Remove → Add (live subscription).
		expect(
			websocket.queryEvents(withMuteWord('__e2e_release_b__'), mark).map((e) => e.type)
		).toEqual(['Add']);
	});
});

test.describe('convexLoadPaginated — one subscription per query', () => {
	const isPaginatedList = (event: QueryEvent) => event.udfPath === 'messages:paginatedList';

	test('hydration opens exactly one subscription', async ({ page }) => {
		const websocket = recordWebSocket(page);
		await page.goto('/tests/convex-load-paginated');
		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });
		await expect.poll(() => websocket.queryEvents(isPaginatedList).length).toBeGreaterThan(0);
		await page.waitForTimeout(1000);

		expect(websocket.queryEvents(isPaginatedList).map((e) => e.type)).toEqual(['Add']);
	});

	test('client-side navigation opens exactly one subscription', async ({ page }) => {
		const websocket = recordWebSocket(page);
		await page.goto('/tests');
		await expect(page.getByRole('link', { name: /ConvexLoadPaginated/ })).toBeVisible();
		const mark = websocket.mark();

		// The load awaits the first page, so the new page never renders a loading state.
		await page.evaluate(() => {
			const w = window as Window & { __sawLoading?: boolean };
			new MutationObserver(() => {
				if (document.querySelector('[data-testid="loading"]')) w.__sawLoading = true;
			}).observe(document.body, { childList: true, subtree: true });
		});

		await page.getByRole('link', { name: /ConvexLoadPaginated/ }).click();
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });
		await page.waitForTimeout(1000);

		expect(websocket.queryEvents(isPaginatedList, mark).map((e) => e.type)).toEqual(['Add']);
		expect(
			await page.evaluate(() => (window as Window & { __sawLoading?: boolean }).__sawLoading)
		).toBeUndefined();
	});
});
