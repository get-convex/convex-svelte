import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pure-logic helpers extracted from setupAuth() in client.svelte.ts.
//
// setupAuth uses Svelte context + $state/$effect, so we can't mount it
// in a plain vitest. Instead we replicate the seeding + derivation logic
// as pure functions and verify them here.
// ---------------------------------------------------------------------------

/**
 * Mirrors the `isConvexAuthenticated` seeding logic in setupAuth():
 *
 * ```ts
 * const hasInitialState = options?.initialState !== undefined;
 * let isConvexAuthenticated = $state(
 *     hasInitialState ? (options!.initialState!.isAuthenticated ? true : false) : null
 * );
 * ```
 */
function seedIsConvexAuthenticated(
	initialState: { isAuthenticated: boolean } | undefined
): boolean | null {
	const hasInitialState = initialState !== undefined;
	return hasInitialState ? (initialState!.isAuthenticated ? true : false) : null;
}

/**
 * Mirrors the context getters in setupAuth(), including the
 * `providerHasSettled` guard that trusts SSR initial state before
 * the auth provider has reported !isLoading for the first time,
 * and the stale-detection guard that shows loading when the provider
 * changed but the effect hasn't processed it yet.
 */
function deriveAuthContext(
	isConvexAuthenticated: boolean | null,
	providerIsAuthenticated: boolean,
	opts?: {
		providerHasSettled?: boolean;
		hasInitialState?: boolean;
		lastProcessedProviderAuth?: boolean;
	}
) {
	const providerHasSettled = opts?.providerHasSettled ?? true;
	const hasInitialState = opts?.hasInitialState ?? false;
	const lastProcessedProviderAuth = opts?.lastProcessedProviderAuth;

	let isLoading = isConvexAuthenticated === null;
	if (!isLoading && isConvexAuthenticated === false && lastProcessedProviderAuth !== undefined) {
		if (providerIsAuthenticated !== lastProcessedProviderAuth) {
			isLoading = true;
		}
	}

	return {
		isLoading,
		isAuthenticated:
			!providerHasSettled && hasInitialState
				? isConvexAuthenticated === true
				: providerIsAuthenticated && (isConvexAuthenticated ?? false)
	};
}

/**
 * Mirrors the effect's state-sync logic for the `providerLoading` →
 * `isConvexAuthenticated` reset, including the `providerHasSettled` guard:
 *
 * ```ts
 * if (providerLoading && isConvexAuthenticated !== null && providerHasSettled) {
 *     isConvexAuthenticated = null;
 * }
 * ```
 */
function applyProviderLoadingSync(
	isConvexAuthenticated: boolean | null,
	providerLoading: boolean,
	providerHasSettled: boolean
): boolean | null {
	if (providerLoading && isConvexAuthenticated !== null && providerHasSettled) {
		return null;
	}
	return isConvexAuthenticated;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupAuth: initialState seeding', () => {
	it('seeds isConvexAuthenticated = true when server says authenticated', () => {
		expect(seedIsConvexAuthenticated({ isAuthenticated: true })).toBe(true);
	});

	it('seeds isConvexAuthenticated = false when server says NOT authenticated', () => {
		// This is the SSR bug fix — previously this returned null because:
		//   false ? true : null  →  null
		// After the fix:
		//   hasInitialState ? (false ? true : false) : null  →  false
		expect(seedIsConvexAuthenticated({ isAuthenticated: false })).toBe(false);
	});

	it('seeds isConvexAuthenticated = null when no initialState provided', () => {
		expect(seedIsConvexAuthenticated(undefined)).toBe(null);
	});
});

describe('setupAuth: SSR hydration — provider NOT yet settled', () => {
	it('server authenticated, provider still loading → trusts server: isLoading=false, isAuthenticated=true', () => {
		const seed = seedIsConvexAuthenticated({ isAuthenticated: true });
		// Provider hasn't settled yet (Better Auth session pending on hydration).
		// The isAuthenticated getter trusts the SSR initial state.
		const ctx = deriveAuthContext(seed, false, {
			providerHasSettled: false,
			hasInitialState: true
		});
		expect(ctx.isLoading).toBe(false);
		expect(ctx.isAuthenticated).toBe(true);
	});

	it('server NOT authenticated, provider still loading → trusts server: isLoading=false, isAuthenticated=false', () => {
		const seed = seedIsConvexAuthenticated({ isAuthenticated: false });
		const ctx = deriveAuthContext(seed, false, {
			providerHasSettled: false,
			hasInitialState: true
		});
		expect(ctx.isLoading).toBe(false);
		expect(ctx.isAuthenticated).toBe(false);
	});

	it('no server state, provider still loading → isLoading=true (client must resolve)', () => {
		const seed = seedIsConvexAuthenticated(undefined);
		const ctx = deriveAuthContext(seed, false, {
			providerHasSettled: false,
			hasInitialState: false
		});
		expect(ctx.isLoading).toBe(true);
		expect(ctx.isAuthenticated).toBe(false);
	});

	it('SSR bug regression: server NOT authenticated must NOT show isLoading=true', () => {
		const seed = seedIsConvexAuthenticated({ isAuthenticated: false });
		const ctx = deriveAuthContext(seed, false, {
			providerHasSettled: false,
			hasInitialState: true
		});
		expect(ctx.isLoading).toBe(false);
		expect(ctx.isAuthenticated).toBe(false);
	});
});

describe('setupAuth: providerHasSettled guard on loading reset', () => {
	it('does NOT reset SSR seed when provider is loading and has not settled yet', () => {
		const seed = seedIsConvexAuthenticated({ isAuthenticated: true });
		// Provider is loading, but has never settled → guard prevents reset
		const result = applyProviderLoadingSync(seed, true, false);
		expect(result).toBe(true); // seed preserved
	});

	it('DOES reset when provider goes back to loading after having settled', () => {
		// Provider settled before and now went back to loading
		const result = applyProviderLoadingSync(true, true, true);
		expect(result).toBe(null); // reset to loading
	});

	it('does not reset null (already loading)', () => {
		const result = applyProviderLoadingSync(null, true, true);
		expect(result).toBe(null); // no-op, already null
	});
});

describe('setupAuth: SSR hydration — synchronous setAuth to prevent auth gap', () => {
	// Mirrors the synchronous setAuth logic added to setupAuth():
	//
	// ```ts
	// let initialSetAuthActive = false;
	// if (BROWSER && hasInitialState && options!.initialState!.isAuthenticated) {
	//     const { fetchAccessToken } = authProvider();
	//     initialSetAuthActive = true;
	//     client.setAuth(fetchAccessToken, ...);
	// }
	// ```
	//
	// Without this, child useQuery $effects create subscriptions on an
	// unauthenticated WebSocket.  The ConvexClient's AuthenticationManager
	// pauses the WebSocket during token fetch, so calling setAuth before
	// effects run prevents unauthenticated query results from overriding
	// initialData.

	function shouldCallSyncSetAuth(
		isBrowser: boolean,
		initialState: { isAuthenticated: boolean } | undefined
	): boolean {
		const hasInitialState = initialState !== undefined;
		return isBrowser && hasInitialState && !!initialState?.isAuthenticated;
	}

	it('calls setAuth synchronously when SSR confirms authenticated (browser)', () => {
		expect(shouldCallSyncSetAuth(true, { isAuthenticated: true })).toBe(true);
	});

	it('does NOT call setAuth synchronously when SSR says not authenticated', () => {
		expect(shouldCallSyncSetAuth(true, { isAuthenticated: false })).toBe(false);
	});

	it('does NOT call setAuth synchronously when no initialState provided', () => {
		expect(shouldCallSyncSetAuth(true, undefined)).toBe(false);
	});

	it('does NOT call setAuth synchronously during SSR (non-browser)', () => {
		expect(shouldCallSyncSetAuth(false, { isAuthenticated: true })).toBe(false);
	});

	it('sync callback always updates state (no guard)', () => {
		// The sync callback has no initialSetAuthActive guard — it always
		// updates isConvexAuthenticated.  The AuthenticationManager replaces
		// the callback when the $effect's cleanup calls client.setAuth(),
		// so stale updates are not possible after cleanup.
		let stateValue: boolean | null = null;

		const syncOnChange = (backendIsAuthenticated: boolean) => {
			stateValue = backendIsAuthenticated;
		};

		syncOnChange(true);
		expect(stateValue).toBe(true);

		syncOnChange(false);
		expect(stateValue).toBe(false);
	});

	it('$effect skips setAuth when initialSetAuthActive is true (hydration guard)', () => {
		// Simulates the hydration guard: when the $effect sees providerAuth=true
		// but initialSetAuthActive is true, it hands over cleanup responsibility
		// WITHOUT calling client.setAuth() again (which would pause the socket).
		let initialSetAuthActive = true;
		let setAuthCallCount = 0;

		const simulateEffectRun = (providerAuth: boolean) => {
			if (initialSetAuthActive) {
				if (providerAuth) {
					initialSetAuthActive = false;
					// Returns cleanup — but does NOT call client.setAuth()
					return 'cleanup';
				}
				// Provider not ready — skip everything
				return 'skip';
			}
			// Normal path: would call client.setAuth()
			if (providerAuth) {
				setAuthCallCount++;
				return 'setAuth';
			}
			return 'noop';
		};

		// Run 1: provider loading (auth=false), sync setAuth active → skip
		expect(simulateEffectRun(false)).toBe('skip');
		expect(setAuthCallCount).toBe(0);

		// Run 2: provider settled (auth=true), sync setAuth active → handover
		expect(simulateEffectRun(true)).toBe('cleanup');
		expect(setAuthCallCount).toBe(0); // No redundant setAuth!
		expect(initialSetAuthActive).toBe(false); // Flag cleared

		// Run 3: after handover, normal path
		expect(simulateEffectRun(true)).toBe('setAuth');
		expect(setAuthCallCount).toBe(1);
	});
});

describe('setupAuth: auth state transitions after provider settles', () => {
	it('provider says authenticated, backend confirms → authenticated', () => {
		const ctx = deriveAuthContext(true, true);
		expect(ctx.isLoading).toBe(false);
		expect(ctx.isAuthenticated).toBe(true);
	});

	it('provider says authenticated, backend pending (null) → loading', () => {
		const ctx = deriveAuthContext(null, true);
		expect(ctx.isLoading).toBe(true);
		expect(ctx.isAuthenticated).toBe(false);
	});

	it('provider says authenticated, backend rejects → not authenticated', () => {
		// lastProcessedProviderAuth=true means the effect already processed
		// the provider's authenticated state and called setAuth, but the
		// backend rejected the token.
		const ctx = deriveAuthContext(false, true, { lastProcessedProviderAuth: true });
		expect(ctx.isLoading).toBe(false);
		expect(ctx.isAuthenticated).toBe(false);
	});

	it('provider says not authenticated → not authenticated regardless of backend', () => {
		expect(deriveAuthContext(true, false).isAuthenticated).toBe(false);
		expect(deriveAuthContext(false, false).isAuthenticated).toBe(false);
		expect(deriveAuthContext(null, false).isAuthenticated).toBe(false);
	});

	it('stale detection: provider changed to authenticated but effect has not run → loading', () => {
		// After signIn, the session atom fires synchronously and the
		// provider now says authenticated.  But the $effect hasn't
		// processed this yet — lastProcessedProviderAuth is still false
		// (from before sign-in) and isConvexAuthenticated is still false.
		const ctx = deriveAuthContext(false, true, { lastProcessedProviderAuth: false });
		expect(ctx.isLoading).toBe(true);
		expect(ctx.isAuthenticated).toBe(false);
	});

	it('stale detection: does not fire when effect has already processed the provider state', () => {
		// The effect has run and processed providerAuth=true, but the
		// backend rejected the token → isConvexAuthenticated=false.
		// This is the final state, not a stale read.
		const ctx = deriveAuthContext(false, true, { lastProcessedProviderAuth: true });
		expect(ctx.isLoading).toBe(false);
	});

	it('stale detection: does not fire before first effect run (undefined)', () => {
		// Before the effect runs at all, lastProcessedProviderAuth is
		// undefined.  The stale check must not fire.
		const ctx = deriveAuthContext(false, true, { lastProcessedProviderAuth: undefined });
		expect(ctx.isLoading).toBe(false);
	});
});
