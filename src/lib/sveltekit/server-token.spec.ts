import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Tests for withServerConvexToken — AsyncLocalStorage-based token context.
//
// withServerConvexToken(token, fn) stores the auth token for the duration of
// fn, allowing convexLoad and createConvexHttpClient to auto-read it during
// SSR without explicit { token } options.
// ---------------------------------------------------------------------------

// Mock the singleton's _setServerTokenGetter so we can verify registration.
const { mockSetServerTokenGetter } = vi.hoisted(() => {
	return { mockSetServerTokenGetter: vi.fn() };
});

vi.mock('../internal/singleton.js', () => ({
	_setServerTokenGetter: mockSetServerTokenGetter
}));

import { withServerConvexToken } from './server-token.js';

describe('withServerConvexToken', () => {
	// Capture the getter once — the side-effect registration only fires on import,
	// and beforeEach(clearAllMocks) would wipe the recorded calls.
	const getter = mockSetServerTokenGetter.mock.calls[0]?.[0] as
		| (() => string | undefined)
		| undefined;

	it('registers a token getter on the singleton when the module is imported', () => {
		expect(mockSetServerTokenGetter).toHaveBeenCalledOnce();
		expect(typeof getter).toBe('function');
	});

	it('stores and retrieves token within the callback', () => {
		const result = withServerConvexToken('test-token-123', () => {
			return getter!();
		});

		expect(result).toBe('test-token-123');
	});

	it('returns undefined outside the callback', () => {
		// Outside any withServerConvexToken context
		expect(getter!()).toBeUndefined();
	});

	it('handles undefined token', () => {
		const result = withServerConvexToken(undefined, () => {
			return getter!();
		});

		expect(result).toBeUndefined();
	});

	it('maintains correct scoping with nested calls', () => {
		const tokens: (string | undefined)[] = [];

		withServerConvexToken('outer-token', () => {
			tokens.push(getter!());

			withServerConvexToken('inner-token', () => {
				tokens.push(getter!());
			});

			// After inner returns, outer token is restored
			tokens.push(getter!());
		});

		expect(tokens).toEqual(['outer-token', 'inner-token', 'outer-token']);
	});

	it('returns the callback return value', () => {
		const result = withServerConvexToken('token', () => {
			return { data: 42 };
		});

		expect(result).toEqual({ data: 42 });
	});

	it('works with async callbacks', async () => {
		const result = await withServerConvexToken('async-token', async () => {
			// Simulate async work
			await new Promise((resolve) => setTimeout(resolve, 1));
			return getter!();
		});

		expect(result).toBe('async-token');
	});
});
