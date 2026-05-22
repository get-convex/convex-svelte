import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Tests for convexLoad / convexLoadPaginated server-side token auto-read.
//
// When `withServerConvexToken(token, fn)` wraps the SvelteKit handle hook,
// `convexLoad` and `convexLoadPaginated` should automatically pick up the
// token during SSR without requiring an explicit `{ token }` option.
//
// These tests simulate the SERVER environment (no globalThis.document).
// ---------------------------------------------------------------------------

// All mock variables must live inside vi.hoisted so they exist when
// vi.mock factories execute (vi.mock is hoisted above normal declarations).
const {
	mockHttpClientQuery,
	mockSetAuth,
	mockHttpClientConstructed,
	MockConvexHttpClient,
	mockGetServerToken
} = vi.hoisted(() => {
	// Ensure NO document — simulates server environment.
	// IS_BROWSER = typeof globalThis.document !== 'undefined'
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	delete (globalThis as any)['document'];

	const mockHttpClientQuery = vi.fn();
	const mockSetAuth = vi.fn();
	const mockHttpClientConstructed = vi.fn();
	const mockGetServerToken = vi.fn<() => string | undefined>().mockReturnValue(undefined);

	class MockConvexHttpClient {
		query = mockHttpClientQuery;
		setAuth = mockSetAuth;
		constructor(...args: unknown[]) {
			mockHttpClientConstructed(...args);
		}
	}

	return {
		mockHttpClientQuery,
		mockSetAuth,
		mockHttpClientConstructed,
		MockConvexHttpClient,
		mockGetServerToken
	};
});

// --- Mock dependencies ---

vi.mock('../internal/singleton.js', () => ({
	getConvexUrl: () => 'https://test.convex.cloud',
	getConvexClient: () => {
		throw new Error('getConvexClient should not be called on the server');
	},
	deferSubscription: (fn: () => void) => fn(),
	_getServerToken: () => mockGetServerToken()
}));

vi.mock('convex/browser', () => ({
	ConvexHttpClient: MockConvexHttpClient
}));

vi.mock('./query-detached.svelte.js', () => ({
	createDetachedQuery: vi.fn(
		(_ref: unknown, _args: unknown, initialData: unknown) =>
			({
				data: initialData,
				isLoading: false,
				error: undefined,
				isStale: false
			}) as const
	)
}));

vi.mock('./paginated-query-detached.svelte.js', () => ({
	createDetachedPaginatedQuery: vi.fn(
		(_ref: unknown, _args: unknown, options: { initialData?: { page: unknown[] } }) =>
			({
				results: options.initialData?.page ?? [],
				status: 'CanLoadMore' as const,
				isLoading: false,
				error: undefined,
				loadMore: () => false
			}) as const
	)
}));

vi.mock('convex/server', () => ({
	getFunctionName: (ref: { _name?: string }) => ref?._name ?? 'test:query',
	makeFunctionReference: (name: string) => ({ _name: name })
}));

import { convexLoad, convexLoadPaginated } from './transport.svelte.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRef = { _name: 'messages:list' } as any;

describe('convexLoad — server-side auto-reads token from withServerConvexToken', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetServerToken.mockReturnValue(undefined);
	});

	it('auto-reads token and calls setAuth when withServerConvexToken is active', async () => {
		mockGetServerToken.mockReturnValue('auto-token-123');
		mockHttpClientQuery.mockResolvedValueOnce([{ id: '1' }]);

		await convexLoad(mockRef, {});

		expect(mockSetAuth).toHaveBeenCalledOnce();
		expect(mockSetAuth).toHaveBeenCalledWith('auto-token-123');
		expect(mockHttpClientQuery).toHaveBeenCalledOnce();
	});

	it('explicit { token } option overrides auto-read token', async () => {
		mockGetServerToken.mockReturnValue('auto-token-123');
		mockHttpClientQuery.mockResolvedValueOnce([{ id: '1' }]);

		await convexLoad(mockRef, {}, { token: 'explicit-token-456' });

		expect(mockSetAuth).toHaveBeenCalledOnce();
		expect(mockSetAuth).toHaveBeenCalledWith('explicit-token-456');
	});

	it('does not call setAuth when no token is available', async () => {
		mockGetServerToken.mockReturnValue(undefined);
		mockHttpClientQuery.mockResolvedValueOnce([{ id: '1' }]);

		await convexLoad(mockRef, {});

		expect(mockSetAuth).not.toHaveBeenCalled();
	});

	it('creates ConvexHttpClient on server side', async () => {
		mockHttpClientQuery.mockResolvedValueOnce([]);

		await convexLoad(mockRef, {});

		expect(mockHttpClientConstructed).toHaveBeenCalledWith('https://test.convex.cloud');
	});
});

describe('convexLoadPaginated — server-side auto-reads token from withServerConvexToken', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetServerToken.mockReturnValue(undefined);
	});

	it('auto-reads token and calls setAuth when withServerConvexToken is active', async () => {
		mockGetServerToken.mockReturnValue('auto-token-789');
		const mockPaginatedData = { page: [{ id: '1' }], isDone: false, continueCursor: 'c1' };
		mockHttpClientQuery.mockResolvedValueOnce(mockPaginatedData);

		await convexLoadPaginated(mockRef, {}, { initialNumItems: 10 });

		expect(mockSetAuth).toHaveBeenCalledOnce();
		expect(mockSetAuth).toHaveBeenCalledWith('auto-token-789');
	});

	it('explicit { token } option overrides auto-read token', async () => {
		mockGetServerToken.mockReturnValue('auto-token-789');
		const mockPaginatedData = { page: [{ id: '1' }], isDone: false, continueCursor: 'c1' };
		mockHttpClientQuery.mockResolvedValueOnce(mockPaginatedData);

		await convexLoadPaginated(mockRef, {}, { initialNumItems: 10, token: 'explicit-token-abc' });

		expect(mockSetAuth).toHaveBeenCalledOnce();
		expect(mockSetAuth).toHaveBeenCalledWith('explicit-token-abc');
	});

	it('does not call setAuth when no token is available', async () => {
		const mockPaginatedData = { page: [], isDone: true, continueCursor: '' };
		mockHttpClientQuery.mockResolvedValueOnce(mockPaginatedData);

		await convexLoadPaginated(mockRef, {}, { initialNumItems: 5 });

		expect(mockSetAuth).not.toHaveBeenCalled();
	});
});
