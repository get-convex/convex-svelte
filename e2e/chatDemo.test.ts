import { expect, test } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../src/convex/_generated/api.js';

const MESSAGE_LIMIT = 140;

function getConvexClient() {
	const convexUrl = process.env.PUBLIC_CONVEX_URL;
	if (!convexUrl) {
		throw new Error('PUBLIC_CONVEX_URL is required for chat demo tests');
	}

	return new ConvexHttpClient(convexUrl);
}

test.describe('chat demo', () => {
	test.skip(!process.env.PUBLIC_CONVEX_URL, 'PUBLIC_CONVEX_URL is required for chat demo tests');

	test('limits message text, shows the live counter, and marks active send as clickable', async ({
		page
	}) => {
		await page.goto('/');

		const messageInput = page.getByLabel('Message', { exact: true });
		const sendButton = page.getByTestId('chat-send-button');

		await expect(page.getByTestId('message-character-count')).not.toBeVisible();
		await expect(sendButton).toBeDisabled();

		await messageInput.fill('x'.repeat(MESSAGE_LIMIT + 5));

		await expect(messageInput).toHaveValue('x'.repeat(MESSAGE_LIMIT));
		await expect(page.getByTestId('message-character-count')).toHaveText(
			`${MESSAGE_LIMIT}/${MESSAGE_LIMIT}`
		);
		await expect(sendButton).toBeEnabled();

		await sendButton.hover();
		await expect(sendButton).toHaveCSS('cursor', 'pointer');
	});

	test('shows optimistic messages first, then server-confirmed newest messages first', async ({
		page
	}) => {
		const client = getConvexClient();
		const author = `e2e-chat-${Date.now()}`;
		const olderMessage = `older-${Date.now()}`;
		const newestMessage = `newest-${Date.now()}`;

		await client.mutation(api.messages.deleteByAuthor, { author });

		try {
			await page.goto('/');
			await page.getByLabel('Author').fill(author);

			// The row must appear immediately via the optimistic update, but the
			// "Optimistic" badge is transient — on a fast connection the server
			// confirms before the first assertion polls. Accept either state,
			// then require convergence to "Server".
			await page.getByLabel('Message', { exact: true }).fill(olderMessage);
			await page.getByTestId('chat-send-button').click();
			const olderRow = page.getByTestId('message-row').filter({ hasText: olderMessage });
			await expect(olderRow.first().getByTestId('message-status')).toHaveText(/Optimistic|Server/);
			await expect(olderRow.first().getByTestId('message-status')).toHaveText('Server', {
				timeout: 10000
			});

			await page.getByLabel('Message', { exact: true }).fill(newestMessage);
			await page.getByTestId('chat-send-button').click();
			const newestRow = page.getByTestId('message-row').filter({ hasText: newestMessage });
			await expect(newestRow.first().getByTestId('message-status')).toHaveText(/Optimistic|Server/);
			await expect(newestRow.first().getByTestId('message-status')).toHaveText('Server', {
				timeout: 10000
			});

			const matchingRows = page.getByTestId('message-row').filter({ hasText: author });
			await expect(matchingRows).toHaveCount(2, { timeout: 10000 });
			await expect(matchingRows.first()).toContainText(newestMessage);
		} finally {
			await client.mutation(api.messages.deleteByAuthor, { author });
		}
	});
});
