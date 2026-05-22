import { expect, test } from '@playwright/test';

test.describe('getConvexClient — mutations from non-component .ts files', () => {
	test('can call mutations from a plain .ts utility using getConvexClient()', async ({ page }) => {
		await page.goto('/tests/get-convex-client');
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Ensure no leftover test messages
		await page.getByTestId('cleanup-btn').click();
		await expect(page.getByTestId('test-message-exists')).toContainText('false', {
			timeout: 5000
		});

		// Send a message from the plain .ts utility (not a Svelte component)
		await page.getByTestId('send-btn').click();
		await expect(page.getByTestId('sent')).toContainText('true');

		// Verify the message appears in the reactive query results
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
