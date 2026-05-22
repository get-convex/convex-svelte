import { expect, test } from '@playwright/test';

test.describe('keepPreviousData for useQuery', () => {
	test('displays stale data while loading new args', async ({ page }) => {
		await page.goto('/tests/keep-previous-data');

		// Wait for initial data to load
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });
		await expect(page.getByTestId('is-loading')).toContainText('false');

		// Record initial count
		const initialText = await page.getByTestId('data').textContent();
		const initialMatch = initialText?.match(/(\d+) messages/);
		const initialCount = initialMatch ? parseInt(initialMatch[1], 10) : -1;
		expect(initialCount).toBeGreaterThan(0);

		// Change args — with keepPreviousData, data should remain visible (not loading)
		await page.getByTestId('change-args').click();

		// Data should still be visible (keepPreviousData keeps previous results)
		await expect(page.getByTestId('data')).toBeVisible();
		await expect(page.getByTestId('loading')).not.toBeVisible();

		// After the new query resolves, data should update
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId('is-loading')).toContainText('false');
	});

	test('reset args restores original data', async ({ page }) => {
		await page.goto('/tests/keep-previous-data');
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Change and reset args
		await page.getByTestId('change-args').click();
		await page.waitForTimeout(500);
		await page.getByTestId('reset-args').click();

		// Should show data without ever going to loading
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId('is-loading')).toContainText('false');
	});
});
