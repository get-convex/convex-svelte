import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Tests for convexLoad / convexLoadPaginated client-side navigation behavior.
//
// Problem: On client-side navigation (browser), convexLoad currently creates
// a new unauthenticated ConvexHttpClient. This means authenticated queries
// fail in +page.ts universal load functions during client-side navigation.
//
// Fix: Use the singleton ConvexClient (already authenticated via setupAuth)
// for the initial fetch on the client side.
// ---------------------------------------------------------------------------

// All mock variables must live inside vi.hoisted so they exist when
// vi.mock factories execute (vi.mock is hoisted above normal declarations).
const { mockSingletonQuery, mockHttpClientQuery, mockHttpClientConstructed, MockConvexHttpClient } =
	vi.hoisted(() => {
		// Simulate browser environment BEFORE any module evaluates IS_BROWSER.
		// IS_BROWSER = typeof globalThis.document !== 'undefined'
		globalThis.document = {} as Document;

		const mockSingletonQuery = vi.fn();
		const mockHttpClientQuery = vi.fn();
		const mockSetAuth = vi.fn();
		const mockHttpClientConstructed = vi.fn();
		// Use a real class so `new ConvexHttpClient(...)` works in the module under test.
		class MockConvexHttpClient {
			query = mockHttpClientQuery;
			setAuth = mockSetAuth;
			constructor(...args: unknown[]) {
				mockHttpClientConstructed(...args);
			}
		}

		return {
			mockSingletonQuery,
			mockHttpClientQuery,
			mockSetAuth,
			mockHttpClientConstructed,
			MockConvexHttpClient
		};
	});

// --- Mock dependencies ---

vi.mock('../internal/singleton.js', () => ({
	getConvexUrl: () => 'https://test.convex.cloud',
	getConvexClient: () => ({
		query: mockSingletonQuery,
		disabled: false,
		onUpdate: vi.fn()
	}),
	deferSubscription: (fn: () => void) => fn()
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
import { createDetachedQuery } from './query-detached.svelte.js';
import { createDetachedPaginatedQuery } from './paginated-query-detached.svelte.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRef = { _name: 'messages:list' } as any;

describe('convexLoad — client-side navigation uses authenticated singleton', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses getConvexClient().query() on client-side, NOT ConvexHttpClient', async () => {
		const mockData = [{ id: '1', text: 'hello' }];
		mockSingletonQuery.mockResolvedValueOnce(mockData);

		await convexLoad(mockRef, { muteWords: [] });

		// Singleton ConvexClient should be used (authenticated)
		expect(mockSingletonQuery).toHaveBeenCalledOnce();
		expect(mockSingletonQuery).toHaveBeenCalledWith(mockRef, { muteWords: [] });

		// ConvexHttpClient should NOT be used for the query
		expect(mockHttpClientQuery).not.toHaveBeenCalled();
	});

	it('passes initial data from singleton query to createDetachedQuery', async () => {
		const mockData = [{ id: '1', text: 'hello' }];
		mockSingletonQuery.mockResolvedValueOnce(mockData);

		await convexLoad(mockRef, { muteWords: [] });

		expect(createDetachedQuery).toHaveBeenCalledWith(mockRef, { muteWords: [] }, mockData);
	});

	it('does not create ConvexHttpClient on client-side', async () => {
		mockSingletonQuery.mockResolvedValueOnce([]);

		await convexLoad(mockRef, {});

		expect(mockHttpClientConstructed).not.toHaveBeenCalled();
	});
});

describe('convexLoadPaginated — client-side navigation uses authenticated singleton', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses getConvexClient().query() on client-side, NOT ConvexHttpClient', async () => {
		const mockPaginatedData = {
			page: [{ id: '1', text: 'hello' }],
			isDone: false,
			continueCursor: 'cursor1'
		};
		mockSingletonQuery.mockResolvedValueOnce(mockPaginatedData);

		await convexLoadPaginated(mockRef, { muteWords: [] }, { initialNumItems: 10 });

		// Singleton ConvexClient should be used (authenticated)
		expect(mockSingletonQuery).toHaveBeenCalledOnce();
		expect(mockSingletonQuery).toHaveBeenCalledWith(mockRef, {
			muteWords: [],
			paginationOpts: { numItems: 10, cursor: null }
		});

		// ConvexHttpClient should NOT be used for the query
		expect(mockHttpClientQuery).not.toHaveBeenCalled();
	});

	it('passes initial data from singleton query to createDetachedPaginatedQuery', async () => {
		const mockPaginatedData = {
			page: [{ id: '1', text: 'hello' }],
			isDone: false,
			continueCursor: 'cursor1'
		};
		mockSingletonQuery.mockResolvedValueOnce(mockPaginatedData);

		await convexLoadPaginated(mockRef, { muteWords: [] }, { initialNumItems: 10 });

		expect(createDetachedPaginatedQuery).toHaveBeenCalledWith(
			mockRef,
			{ muteWords: [] },
			{
				initialNumItems: 10,
				initialData: mockPaginatedData
			}
		);
	});

	it('does not create ConvexHttpClient on client-side', async () => {
		const mockPaginatedData = { page: [], isDone: true, continueCursor: '' };
		mockSingletonQuery.mockResolvedValueOnce(mockPaginatedData);

		await convexLoadPaginated(mockRef, {}, { initialNumItems: 5 });

		expect(mockHttpClientConstructed).not.toHaveBeenCalled();
	});
});

describe('convexLoad — skip support', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a static skip result without querying', async () => {
		const result = await convexLoad(mockRef, 'skip');

		expect(result.data).toBeUndefined();
		expect(result.isLoading).toBe(false);
		expect(result.error).toBeUndefined();
		expect(result.isStale).toBe(false);

		// No queries should have been made
		expect(mockSingletonQuery).not.toHaveBeenCalled();
		expect(mockHttpClientQuery).not.toHaveBeenCalled();
		expect(mockHttpClientConstructed).not.toHaveBeenCalled();
	});

	it('does not create a detached query subscription', async () => {
		await convexLoad(mockRef, 'skip');

		expect(createDetachedQuery).not.toHaveBeenCalled();
	});
});

describe('convexLoadPaginated — skip support', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a static skip result without querying', async () => {
		const result = await convexLoadPaginated(mockRef, 'skip', { initialNumItems: 10 });

		expect(result.results).toEqual([]);
		expect(result.status).toBe('Exhausted');
		expect(result.isLoading).toBe(false);
		expect(result.error).toBeUndefined();
		expect(result.loadMore(10)).toBe(false);

		// No queries should have been made
		expect(mockSingletonQuery).not.toHaveBeenCalled();
		expect(mockHttpClientQuery).not.toHaveBeenCalled();
		expect(mockHttpClientConstructed).not.toHaveBeenCalled();
	});

	it('does not create a detached paginated query subscription', async () => {
		await convexLoadPaginated(mockRef, 'skip', { initialNumItems: 10 });

		expect(createDetachedPaginatedQuery).not.toHaveBeenCalled();
	});
});
