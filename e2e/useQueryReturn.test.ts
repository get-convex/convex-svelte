import { expect, test } from '@playwright/test';

test('always-errors page loads', async ({ page }) => {
	await page.goto('/tests/always-errors');
	await expect(page.locator('h1')).toBeVisible();
	await new Promise((r) => setTimeout(r, 1000));
});
