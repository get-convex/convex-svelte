import { expect, test } from '@playwright/test';

test.describe('SvelteKit singleton (initConvex + setupConvex)', () => {
	test('initConvex and setupConvex share the same client instance', async ({ page }) => {
		await page.goto('/tests/sveltekit-singleton');

		// Verify that earlyClient === layoutClient === moduleClient
		await expect(page.getByTestId('same-client')).toContainText('sameClient: true');
	});

	test('queries still work through the singleton client', async ({ page }) => {
		await page.goto('/tests/sveltekit-singleton');

		// Query should load and return data
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 5000 });
	});
});
