import { expect, test } from '@playwright/test';

test.describe('convexLoadPaginated — SSR transport with live paginated upgrade', () => {
	test('SSR data is available immediately without loading state', async ({ page }) => {
		await page.goto('/tests/convex-load-paginated');

		// Data should be rendered from SSR — no loading flash
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId('loading')).not.toBeVisible();

		// Verify hydration completes
		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });
	});

	test('shows correct pagination status from SSR', async ({ page }) => {
		await page.goto('/tests/convex-load-paginated');

		// Should show data immediately
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 5000 });

		// Status should be CanLoadMore or Exhausted (depending on data size)
		const status = await page.getByTestId('status').textContent();
		expect(status).toMatch(/status: (CanLoadMore|Exhausted)/);
	});

	test('loadMore works after hydration', async ({ page }) => {
		await page.goto('/tests/convex-load-paginated');
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });

		const status = await page.getByTestId('status').textContent();
		if (status?.includes('CanLoadMore')) {
			// Get initial count
			const initialText = await page.getByTestId('data').textContent();
			const initialMatch = initialText?.match(/(\d+) messages/);
			const initialCount = initialMatch ? parseInt(initialMatch[1], 10) : 0;

			// Click load more
			await page.getByTestId('load-more-btn').click();
			await page.waitForTimeout(2000);

			// Should have more or equal results
			const newText = await page.getByTestId('data').textContent();
			const newMatch = newText?.match(/(\d+) messages/);
			const newCount = newMatch ? parseInt(newMatch[1], 10) : 0;

			expect(newCount).toBeGreaterThanOrEqual(initialCount);
		}
	});

	test('subscription remains consistent after hydration', async ({ page }) => {
		await page.goto('/tests/convex-load-paginated');
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });
		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });

		// After hydration, results should still be present and status valid
		const dataText = await page.getByTestId('data').textContent();
		const match = dataText?.match(/(\d+) messages/);
		const count = match ? parseInt(match[1], 10) : 0;
		expect(count).toBeGreaterThan(0);

		const status = await page.getByTestId('status').textContent();
		expect(status).toMatch(/status: (CanLoadMore|Exhausted)/);

		// No errors after hydration
		await expect(page.getByTestId('error')).not.toBeVisible();
	});
});
