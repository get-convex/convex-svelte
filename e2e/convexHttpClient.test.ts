import { expect, test } from '@playwright/test';

test.describe('createConvexHttpClient — server-side data fetching', () => {
	test('loads data via createConvexHttpClient in +page.server.ts', async ({ page }) => {
		await page.goto('/tests/convex-http-client');

		// Data should be available from the server load function
		const dataEl = page.getByTestId('data');
		await expect(dataEl).toBeVisible({ timeout: 5000 });

		// Should show a positive message count (seed data exists)
		const text = await dataEl.textContent();
		const match = text?.match(/(\d+) messages/);
		const count = match ? parseInt(match[1], 10) : -1;
		expect(count).toBeGreaterThan(0);
	});
});
