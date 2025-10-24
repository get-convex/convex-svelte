import { expect, test } from '@playwright/test';

test('skipQuery prevents query execution', async ({ page }) => {
  await page.goto('/tests/skip-query');
  
  // Initially, query should run and load data
  await expect(page.getByTestId('loading')).toBeVisible();
  await expect(page.getByTestId('data')).toBeVisible({ timeout: 5000 });
  
  // Check the skip checkbox
  await page.getByTestId('skip-checkbox').check();
  
  // When skipped, should show "No data" (not loading, no error, no data)
  await expect(page.getByTestId('no-data')).toBeVisible();
  
  // Uncheck to verify it resumes
  await page.getByTestId('skip-checkbox').uncheck();
  
  // Should load again
  await expect(page.getByTestId('data')).toBeVisible({ timeout: 5000 });
});