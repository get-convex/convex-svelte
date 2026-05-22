import { expect, test } from '@playwright/test';

test.describe('convexLoad — SSR transport with live upgrade', () => {
	test('SSR data is available immediately without loading state', async ({ page }) => {
		await page.goto('/tests/convex-load');

		// Data should be rendered from SSR — no loading flash
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId('loading')).not.toBeVisible();

		// Verify hydration completes
		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });
	});

	test('live subscription receives reactive updates after SSR hydration', async ({ page }) => {
		await page.goto('/tests/convex-load');
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Wait for hydration so onclick handlers are attached
		await expect(page.getByTestId('hydrated')).toContainText('true', { timeout: 5000 });

		// Ensure no leftover test messages
		await page.getByTestId('cleanup-btn').click();
		await expect(page.getByTestId('test-message-exists')).toContainText('false', {
			timeout: 5000
		});

		// Send a message — the live subscription should pick it up
		await page.getByTestId('send-btn').click();
		await expect(page.getByTestId('sent')).toContainText('true', { timeout: 5000 });

		// If mutation failed, show the error for debugging
		const errorText = await page.getByTestId('mutation-error').textContent();
		expect(errorText).toBe('mutationError: ');

		// Verify the new message appears reactively (proves live upgrade worked)
		await expect(page.getByTestId('test-message-exists')).toContainText('true', {
			timeout: 5000
		});

		// Cleanup
		await page.getByTestId('cleanup-btn').click();
		await expect(page.getByTestId('test-message-exists')).toContainText('false', {
			timeout: 5000
		});
	});
});
