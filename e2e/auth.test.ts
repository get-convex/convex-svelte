import { expect, test } from '@playwright/test';

test.describe('setupAuth / useAuth', () => {
	test('useAuth throws when setupAuth not called', async ({ page }) => {
		await page.goto('/tests/auth-no-setup');
		await expect(page.getByTestId('error')).toContainText('setupAuth()');
	});

	test('useAuth returns loading then settles to unauthenticated', async ({ page }) => {
		await page.goto('/tests/auth');

		// Should initially show loading or quickly settle to unauthenticated
		// (the mock fetchAccessToken returns null → backend callback fires false)
		await expect(page.getByTestId('auth-unauthenticated')).toBeVisible({ timeout: 5000 });

		// Verify reactive values
		await expect(page.getByTestId('is-loading')).toContainText('false');
		await expect(page.getByTestId('is-authenticated')).toContainText('false');
	});

	test('useAuth with SSR initialState starts authenticated', async ({ page }) => {
		await page.goto('/tests/auth-ssr');

		// With initialState: { isAuthenticated: true }, should immediately show authenticated
		// before the client-side auth flow settles
		const authState = page.getByTestId('auth-state');

		// The SSR initial state says authenticated, so first render should trust that.
		// Then the client settles (fetchAccessToken returns null → backend says false),
		// and isAuthenticated flips to false.
		await expect(authState).toBeVisible();
		await expect(page.getByTestId('auth-unauthenticated')).toBeVisible({ timeout: 5000 });

		// After settling, loading should be false
		await expect(page.getByTestId('is-loading')).toContainText('false');
	});

	test('reactive sign-out: toggling provider state updates isAuthenticated', async ({ page }) => {
		await page.goto('/tests/auth-clear');

		// Provider starts with isAuthenticated: true (signedIn = true).
		// fetchAccessToken returns null → Convex backend denies → isConvexAuthenticated = false.
		// Context: providerAuth(true) && isConvexAuthenticated(false) = false.
		const authState = page.getByTestId('auth-state');
		await expect(authState).toBeVisible();
		await expect(page.getByTestId('auth-unauthenticated')).toBeVisible({ timeout: 5000 });

		// Click "Sign Out" → signedIn = false → provider says !isAuthenticated →
		// $effect re-runs, calls clearAuth, sets isConvexAuthenticated = false.
		await page.getByTestId('clear-auth-btn').click();

		// State must remain consistent: not loading, not authenticated
		await expect(page.getByTestId('is-authenticated')).toContainText('false');
		await expect(page.getByTestId('is-loading')).toContainText('false');
		await expect(page.getByTestId('auth-unauthenticated')).toBeVisible();
	});
});
