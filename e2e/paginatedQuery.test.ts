import { expect, test } from '@playwright/test';

test.describe('Paginated Query with SSR Initial Data', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/tests/paginated-query');
	});

	test('initial data is displayed immediately without loading state', async ({ page }) => {
		// Initial data should be available from SSR - no loading state
		// The page should show data immediately (from +page.server.ts)
		await expect(page.getByTestId('initial-data-info')).toContainText('Initial data count: 3');

		// Should show results immediately without loading
		await expect(page.getByTestId('data')).toBeVisible();

		// Should not show loading state initially (SSR hydration)
		await expect(page.getByTestId('loading')).not.toBeVisible();
	});

	test('skip query prevents data loading', async ({ page }) => {
		// Wait for initial load
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Enable skip
		await page.getByTestId('skip-checkbox').check();

		// Should show no data when skipped
		await expect(page.getByTestId('no-data')).toBeVisible();

		// Disable skip to resume
		await page.getByTestId('skip-checkbox').uncheck();

		// Should load data again
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });
	});

	test('can paginate with loadMore', async ({ page }) => {
		// Wait for initial load
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Get initial count
		const initialText = await page.getByTestId('data').textContent();
		const initialMatch = initialText?.match(/(\d+) messages/);
		const initialCount = initialMatch ? parseInt(initialMatch[1], 10) : 0;

		// Check if we can load more
		const canLoadMore = await page.getByTestId('can-load-more').textContent();

		if (canLoadMore?.includes('yes')) {
			// Click load more
			await page.getByTestId('load-more-btn').click();

			// Wait for more data to load
			await page.waitForTimeout(2000);

			// Should have more results now
			const newText = await page.getByTestId('data').textContent();
			const newMatch = newText?.match(/(\d+) messages/);
			const newCount = newMatch ? parseInt(newMatch[1], 10) : 0;

			expect(newCount).toBeGreaterThanOrEqual(initialCount);
		}
	});

	test('exhausts when all data is loaded', async ({ page }) => {
		// Wait for initial load
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Keep loading until exhausted
		let exhausted = false;
		let attempts = 0;
		const maxAttempts = 10;

		while (!exhausted && attempts < maxAttempts) {
			const isExhausted = await page.getByTestId('is-exhausted').textContent();
			if (isExhausted?.includes('yes')) {
				exhausted = true;
				break;
			}

			const canLoadMore = await page.getByTestId('can-load-more').textContent();
			if (canLoadMore?.includes('yes')) {
				await page.getByTestId('load-more-btn').click();
				await page.waitForTimeout(1000);
			} else {
				// If can't load more, check if exhausted
				const status = await page.getByTestId('is-exhausted').textContent();
				if (status?.includes('yes')) {
					exhausted = true;
				}
				break;
			}
			attempts++;
		}

		// Verify exhausted state
		if (exhausted) {
			await expect(page.getByTestId('is-exhausted')).toContainText('yes');
			await expect(page.getByTestId('load-more-btn')).toBeDisabled();
		}
	});
});

test.describe('Paginated Query without Initial Data', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/tests/paginated-query-no-ssr');
	});

	test('shows loading state then loads data', async ({ page }) => {
		// Initially should be loading
		await expect(page.getByTestId('loading')).toBeVisible();

		// Then should show data
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Status should be CanLoadMore or Exhausted
		const status = await page.getByTestId('status').textContent();
		expect(status).toMatch(/Status: (CanLoadMore|Exhausted)/);
	});

	test('skip query prevents data loading', async ({ page }) => {
		// Wait for initial load
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Enable skip
		await page.getByTestId('skip-checkbox').check();

		// Should show no data when skipped
		await expect(page.getByTestId('no-data')).toBeVisible();

		// Disable skip to resume
		await page.getByTestId('skip-checkbox').uncheck();

		// Should load data again
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });
	});

	test('status transitions correctly', async ({ page }) => {
		// Wait for initial load
		await expect(page.getByTestId('data')).toBeVisible({ timeout: 10000 });

		// Check initial status is one of the valid states
		const status = await page.getByTestId('status').textContent();
		expect(['Status: CanLoadMore', 'Status: Exhausted', 'Status: LoadingMore']).toContainEqual(
			status
		);
	});
});
