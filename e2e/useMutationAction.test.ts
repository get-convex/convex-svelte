import { expect, test } from '@playwright/test';

test.describe('useMutation / useAction wrappers', () => {
	test('useMutation sends mutation and query updates reactively', async ({ page }) => {
		await page.goto('/tests/use-mutation-action');
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Ensure no leftover test messages
		await page.getByTestId('cleanup-btn').click();
		await expect(page.getByTestId('cleaned')).toContainText('true');
		await expect(page.getByTestId('test-message-exists')).toContainText('false', {
			timeout: 5000
		});

		// Send a test message via useMutation wrapper
		await page.getByTestId('send-btn').click();
		await expect(page.getByTestId('sent')).toContainText('true');

		// Verify the message appears in the reactive query results
		await expect(page.getByTestId('test-message-exists')).toContainText('true', {
			timeout: 5000
		});

		// Verify the exact message content was persisted
		await expect(page.getByTestId('test-message-body')).toContainText(
			'Hello from useMutation e2e test'
		);

		// Cleanup: delete the test message
		await page.getByTestId('cleanup-btn').click();

		// Verify the message is gone from query results
		await expect(page.getByTestId('test-message-exists')).toContainText('false', {
			timeout: 5000
		});
	});
});
