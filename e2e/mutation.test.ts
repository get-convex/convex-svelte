import { expect, test } from '@playwright/test';

test.describe('Mutations', () => {
	test('mutation updates query reactively and cleanup works', async ({ page }) => {
		await page.goto('/tests/mutation');
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Ensure no leftover test messages
		await page.getByTestId('cleanup-btn').click();
		await expect(page.getByTestId('cleaned')).toContainText('true');
		await expect(page.getByTestId('test-message-exists')).toContainText('false', {
			timeout: 5000
		});

		// Send a test message via mutation
		await page.getByTestId('send-btn').click();
		await expect(page.getByTestId('sent')).toContainText('true');

		// Verify the message appears in the reactive query results
		await expect(page.getByTestId('test-message-exists')).toContainText('true', {
			timeout: 5000
		});

		// Cleanup: delete the test message
		await page.getByTestId('cleanup-btn').click();

		// Verify the message is gone from query results
		await expect(page.getByTestId('test-message-exists')).toContainText('false', {
			timeout: 5000
		});
	});
});
