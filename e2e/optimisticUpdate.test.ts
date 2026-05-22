import { expect, test } from '@playwright/test';

test.describe('Optimistic Updates', () => {
	test('optimistic update reflects immediately in the UI', async ({ page }) => {
		await page.goto('/tests/optimistic-update');
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Reset to known state first
		await page.getByTestId('reset-btn').click();
		await expect(page.getByTestId('reset-done')).toContainText('true');
		await expect(page.getByTestId('value-a')).toContainText('0', { timeout: 5000 });

		// Trigger optimistic update — UI should show a=42 immediately
		await page.getByTestId('update-btn').click();
		await expect(page.getByTestId('optimistically-updated')).toContainText('true');
		await expect(page.getByTestId('value-a')).toContainText('42', { timeout: 5000 });

		// After server confirms, value should still be 42
		await page.waitForTimeout(1000);
		await expect(page.getByTestId('value-a')).toContainText('42');

		// Cleanup: reset back to 0
		await page.getByTestId('reset-btn').click();
		await expect(page.getByTestId('value-a')).toContainText('0', { timeout: 5000 });
	});
});
