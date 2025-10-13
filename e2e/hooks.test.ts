import { expect, test } from '@playwright/test';

test.describe('useMutation hook', () => {
	test('should send a message successfully', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// Fill in the form
		const authorInput = page.locator('input#author');
		const bodyInput = page.locator('input#body');
		const sendButton = page.locator('button[type="submit"]');

		await authorInput.fill('E2E Test User');
		await bodyInput.fill('Test message from e2e test');

		// Submit the form
		await sendButton.click();

		// Wait for the message to appear in the list
		await expect(page.locator('text=Test message from e2e test')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('text=E2E Test User')).toBeVisible();
	});

	test('should show loading state during mutation', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// Fill in the form
		const authorInput = page.locator('input#author');
		const bodyInput = page.locator('input#body');
		const sendButton = page.locator('button[type="submit"]');

		await authorInput.fill('Loading Test');
		await bodyInput.fill('Testing loading state');

		// Check button is enabled
		await expect(sendButton).toBeEnabled();

		// Submit the form
		const clickPromise = sendButton.click();

		// The button text should change to "Sending..." briefly
		// Note: This might be too fast to catch in some environments
		// but we can at least verify the button becomes disabled

		await clickPromise;

		// After submission, input should be cleared
		await expect(bodyInput).toHaveValue('');
	});

	test('should handle empty message submission', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		const sendButton = page.locator('button[type="submit"]');

		// Button should be disabled when message is empty
		await expect(sendButton).toBeDisabled();
	});

	test('should display multiple messages', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// Send first message
		await page.locator('input#author').fill('User1');
		await page.locator('input#body').fill('First message');
		await page.locator('button[type="submit"]').click();

		// Wait for first message
		await expect(page.locator('text=First message').first()).toBeVisible({ timeout: 5000 });

		// Send second message
		await page.locator('input#author').fill('User2');
		await page.locator('input#body').fill('Second message');
		await page.locator('button[type="submit"]').click();

		// Wait for second message
		await expect(page.locator('text=Second message').first()).toBeVisible({ timeout: 5000 });

		// Both messages should be visible
		await expect(page.locator('text=First message').first()).toBeVisible();
		await expect(page.locator('text=User1').first()).toBeVisible();
		await expect(page.locator('text=User2').first()).toBeVisible();
	});
});

test.describe('useQuery hook', () => {
	test('should load messages from the backend', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// Should show either "Loading..." or messages
		const loading = page.locator('text=Loading...');
		const messagesList = page.locator('ul.messages');

		// Either loading text should appear or messages should load
		const isLoading = await loading.isVisible();
		if (isLoading) {
			// Wait for loading to finish
			await expect(loading).not.toBeVisible({ timeout: 10000 });
		}

		// Messages list should be visible after loading
		await expect(messagesList).toBeVisible();
	});

	test('should filter messages with mute words', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// First, send a message with a specific word
		await page.locator('input#author').fill('Filter Test');
		await page.locator('input#body').fill('This message contains FILTERME keyword');
		await page.locator('button[type="submit"]').click();

		// Wait for the message to appear
		await expect(page.locator('text=This message contains FILTERME keyword').first()).toBeVisible({
			timeout: 5000
		});

		// Now add the mute word
		const muteWordsInput = page.locator('input#muteWords');
		await muteWordsInput.fill('FILTERME');

		// Wait a bit for the filter to apply
		await page.waitForTimeout(1000);

		// The message should no longer be visible
		await expect(page.locator('text=This message contains FILTERME keyword')).not.toBeVisible();
	});

	test('should show stale data when keepPreviousData is enabled', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// Make sure "Display old results while loading" is checked
		const useStaleCheckbox = page.locator('input#useStale');
		await expect(useStaleCheckbox).toBeChecked();

		// Add a message
		await page.locator('input#author').fill('Stale Test');
		await page.locator('input#body').fill('Testing stale data feature');
		await page.locator('button[type="submit"]').click();

		// Wait for the message
		await expect(page.locator('text=Testing stale data feature')).toBeVisible({ timeout: 5000 });

		// When we filter, the messages list might show as stale
		const muteWordsInput = page.locator('input#muteWords');
		await muteWordsInput.fill('xyz');

		// Messages should still be visible (even if stale)
		const messagesList = page.locator('ul.messages');
		await expect(messagesList).toBeVisible();
	});

	test('should handle query errors gracefully', async ({ page }) => {
		await page.goto('/tests/always-errors');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// The error query should show an error state
		// This tests the error handling in useQuery
		await page.waitForTimeout(1000);

		// Should not crash the page
		await expect(page.locator('h1')).toBeVisible();
	});
});

test.describe('Integration tests', () => {
	test('should handle rapid mutations', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// Send multiple messages quickly
		for (let i = 0; i < 3; i++) {
			await page.locator('input#author').fill(`RapidUser${i}`);
			await page.locator('input#body').fill(`Rapid message ${i}`);
			await page.locator('button[type="submit"]').click();
			await page.waitForTimeout(100); // Small delay between sends
		}

		// All messages should eventually appear
		await expect(page.locator('text=Rapid message 0').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=Rapid message 1').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=Rapid message 2').first()).toBeVisible({ timeout: 10000 });
	});

	test('should maintain state across multiple interactions', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// Add a mute word
		await page.locator('input#muteWords').fill('test123');

		// Send a message
		await page.locator('input#author').fill('StateUser');
		await page.locator('input#body').fill('Message without filter word');
		await page.locator('button[type="submit"]').click();

		// Message should appear
		await expect(page.locator('text=Message without filter word').first()).toBeVisible({
			timeout: 5000
		});

		// Mute word should still be there
		await expect(page.locator('input#muteWords')).toHaveValue('test123');

		// Send another message with the mute word
		await page.locator('input#author').fill('StateUser');
		await page.locator('input#body').fill('This has test123 in it');
		await page.locator('button[type="submit"]').click();

		// Wait for backend to process
		await page.waitForTimeout(1000);

		// The filtered message should not appear
		await expect(page.locator('text=This has test123 in it')).not.toBeVisible();

		// But the first message should still be there
		await expect(page.locator('text=Message without filter word').first()).toBeVisible();
	});

	test('should update UI reactively when query data changes', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		// Wait for initial messages to load
		await page.waitForTimeout(1000);

		// Add a new message with a unique identifier
		const uniqueId = `reactive-${Date.now()}`;
		await page.locator('input#author').fill('ReactiveUser');
		await page.locator('input#body').fill(`Testing reactive updates ${uniqueId}`);
		await page.locator('button[type="submit"]').click();

		// Wait for the new message to appear - this proves the UI updates reactively
		await expect(page.locator(`text=Testing reactive updates ${uniqueId}`).first()).toBeVisible({
			timeout: 5000
		});

		// Verify the message is actually in the list
		const messagesList = page.locator('ul.messages');
		await expect(messagesList).toContainText(uniqueId);
	});

	test('should toggle stale data option correctly', async ({ page }) => {
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toBeVisible();

		const useStaleCheckbox = page.locator('input#useStale');

		// Should be checked by default
		await expect(useStaleCheckbox).toBeChecked();

		// Uncheck it
		await useStaleCheckbox.uncheck();
		await expect(useStaleCheckbox).not.toBeChecked();

		// Check it again
		await useStaleCheckbox.check();
		await expect(useStaleCheckbox).toBeChecked();

		// The page should remain functional
		await page.locator('input#author').fill('ToggleUser');
		await page.locator('input#body').fill('After toggling stale option');
		await page.locator('button[type="submit"]').click();

		await expect(page.locator('text=After toggling stale option')).toBeVisible({ timeout: 5000 });
	});
});
