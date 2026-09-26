import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Tests for convexLoad / convexLoadPaginated in the browser.
//
// - Client-side navigation opens ONE live subscription on the authenticated
//   singleton ConvexClient and awaits its first value — no one-shot
//   client.query() followed by a second subscription, no ConvexHttpClient.
// - During the initial hydration, the server's result from the SSR payload is
//   reused and the subscription is deferred until auth is set up.
// ---------------------------------------------------------------------------

// All mock variables must live inside vi.hoisted so they exist when
// vi.mock factories execute (vi.mock is hoisted above normal declarations).
const {
	mockSingletonQuery,
	mockHttpClientQuery,
	mockHttpClientConstructed,
	MockConvexHttpClient,
	firstValue,
	mockTakeHydratedValue
} = vi.hoisted(() => {
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

	/** Controls the first value of the next subscription opened by convexLoad. */
	const firstValue = {
		resolve: () => {},
		reject: (() => {}) as (e: Error) => void,
		next(): Promise<void> {
			return new Promise<void>((resolve, reject) => {
				firstValue.resolve = resolve;
				firstValue.reject = reject;
			});
		}
	};

	return {
		mockSingletonQuery,
		mockHttpClientQuery,
		mockSetAuth,
		mockHttpClientConstructed,
		MockConvexHttpClient,
		firstValue,
		mockTakeHydratedValue: vi.fn<(key: string) => { value: unknown } | undefined>()
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

vi.mock('./hydration.js', () => ({
	takeHydratedValue: mockTakeHydratedValue,
	recordForHydration: vi.fn(),
	warnHydrationMiss: vi.fn()
}));

vi.mock('./query-detached.svelte.js', () => ({
	createDetachedQuery: vi.fn(
		(_ref: unknown, _args: unknown, initialData: unknown) =>
			({
				data: initialData,
				isLoading: false,
				error: undefined,
				isStale: false,
				dispose: vi.fn()
			}) as const
	),
	openDetachedQuery: vi.fn(() => ({
		result: { data: ['live'], dispose: vi.fn() },
		firstValue: firstValue.next()
	}))
}));

vi.mock('./paginated-query-detached.svelte.js', () => ({
	createDetachedPaginatedQuery: vi.fn(
		(_ref: unknown, _args: unknown, options: { initialData?: { page: unknown[] } }) =>
			({
				results: options.initialData?.page ?? [],
				status: 'CanLoadMore' as const,
				isLoading: false,
				error: undefined,
				loadMore: () => false,
				dispose: vi.fn()
			}) as const
	),
	openDetachedPaginatedQuery: vi.fn(() => ({
		result: { results: ['live'], dispose: vi.fn() },
		firstValue: firstValue.next()
	}))
}));

vi.mock('convex/server', () => ({
	getFunctionName: (ref: { _name?: string }) => ref?._name ?? 'test:query',
	makeFunctionReference: (name: string) => ({ _name: name })
}));

import {
	convexLoad,
	convexLoadPaginated,
	ConvexLoadResult,
	ConvexLoadPaginatedResult,
	encodeConvexLoad,
	decodeConvexLoad,
	encodeConvexLoadPaginated,
	decodeConvexLoadPaginated
} from './transport.svelte.js';
import { createDetachedQuery, openDetachedQuery } from './query-detached.svelte.js';
import { warnHydrationMiss } from './hydration.js';
import {
	createDetachedPaginatedQuery,
	openDetachedPaginatedQuery
} from './paginated-query-detached.svelte.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRef = { _name: 'messages:list' } as any;

/** Whether a promise settles once all pending microtasks have run. */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
	let settled = false;
	promise.then(
		() => (settled = true),
		() => (settled = true)
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	return settled;
}

describe('convexLoad — client-side navigation opens a single live subscription', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTakeHydratedValue.mockReturnValue(undefined);
	});

	it('opens one immediate route-scoped subscription and never runs a one-shot query', async () => {
		const load = convexLoad(mockRef, { muteWords: [] });
		firstValue.resolve();
		const result = await load;

		expect(openDetachedQuery).toHaveBeenCalledOnce();
		expect(openDetachedQuery).toHaveBeenCalledWith(mockRef, { muteWords: [] }, undefined, {
			scope: 'route',
			keepAlive: true,
			immediate: true
		});
		expect(result.data).toEqual(['live']);
		// No separate query: neither the singleton's one-shot query nor HTTP.
		expect(mockSingletonQuery).not.toHaveBeenCalled();
		expect(mockHttpClientConstructed).not.toHaveBeenCalled();
		expect(createDetachedQuery).not.toHaveBeenCalled();
	});

	it('resolves only once the subscription delivered its first value', async () => {
		const load = convexLoad(mockRef, {});

		expect(await isSettled(load)).toBe(false);

		firstValue.resolve();
		expect(await isSettled(load)).toBe(true);
	});

	it('rejects with the query error and disposes the subscription', async () => {
		const load = convexLoad(mockRef, {});
		const { result } = vi.mocked(openDetachedQuery).mock.results[0].value;

		firstValue.reject(new Error('boom'));

		await expect(load).rejects.toThrow('boom');
		expect(result.dispose).toHaveBeenCalledOnce();
	});

	it('passes keepAlive: false through to the route-scoped subscription', async () => {
		const load = convexLoad(mockRef, {}, { keepAlive: false });
		firstValue.resolve();
		await load;

		expect(openDetachedQuery).toHaveBeenCalledWith(mockRef, {}, undefined, {
			scope: 'route',
			keepAlive: false,
			immediate: true
		});
	});
});

describe('convexLoad — initial hydration reuses the SSR payload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('looks the result up by query key', async () => {
		mockTakeHydratedValue.mockReturnValue({ value: ['ssr'] });

		await convexLoad(mockRef, { muteWords: [] });

		expect(mockTakeHydratedValue).toHaveBeenCalledWith('messages:list|{"muteWords":[]}');
	});

	it('uses the server result and defers the subscription (no immediate query)', async () => {
		mockTakeHydratedValue.mockReturnValue({ value: ['ssr'] });

		const result = await convexLoad(mockRef, {}, { keepAlive: false });

		expect(result.data).toEqual(['ssr']);
		expect(createDetachedQuery).toHaveBeenCalledWith(mockRef, {}, ['ssr'], {
			scope: 'route',
			keepAlive: false
		});
		expect(openDetachedQuery).not.toHaveBeenCalled();
		expect(mockSingletonQuery).not.toHaveBeenCalled();
	});

	it('warns (dev) when there is no server result, then subscribes immediately', async () => {
		mockTakeHydratedValue.mockReturnValue(undefined);

		const load = convexLoad(mockRef, {});
		firstValue.resolve();
		await load;

		expect(warnHydrationMiss).toHaveBeenCalledWith('messages:list');
		expect(openDetachedQuery).toHaveBeenCalledOnce();
	});

	it('hydrate: false skips the payload lookup and the warning', async () => {
		mockTakeHydratedValue.mockReturnValue({ value: ['ssr'] });

		const load = convexLoad(mockRef, {}, { hydrate: false });
		firstValue.resolve();
		await load;

		expect(mockTakeHydratedValue).not.toHaveBeenCalled();
		expect(warnHydrationMiss).not.toHaveBeenCalled();
		expect(openDetachedQuery).toHaveBeenCalledOnce();
	});

	it('reuses falsy server results such as null', async () => {
		mockTakeHydratedValue.mockReturnValue({ value: null });

		const result = await convexLoad(mockRef, {});

		expect(result.data).toBeNull();
		expect(openDetachedQuery).not.toHaveBeenCalled();
	});
});

describe('convexLoadPaginated — client-side navigation opens a single live subscription', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTakeHydratedValue.mockReturnValue(undefined);
	});

	it('opens one immediate route-scoped subscription and never runs a one-shot query', async () => {
		const load = convexLoadPaginated(mockRef, { muteWords: [] }, { initialNumItems: 10 });
		firstValue.resolve();
		const result = await load;

		expect(openDetachedPaginatedQuery).toHaveBeenCalledOnce();
		expect(openDetachedPaginatedQuery).toHaveBeenCalledWith(
			mockRef,
			{ muteWords: [] },
			{ initialNumItems: 10, scope: 'route', keepAlive: true, immediate: true }
		);
		expect(result.results).toEqual(['live']);
		expect(mockSingletonQuery).not.toHaveBeenCalled();
		expect(mockHttpClientConstructed).not.toHaveBeenCalled();
	});

	it('resolves only once the subscription delivered its first page', async () => {
		const load = convexLoadPaginated(mockRef, {}, { initialNumItems: 5 });

		expect(await isSettled(load)).toBe(false);

		firstValue.resolve();
		expect(await isSettled(load)).toBe(true);
	});

	it('rejects with the query error and disposes the subscription', async () => {
		const load = convexLoadPaginated(mockRef, {}, { initialNumItems: 5 });
		const { result } = vi.mocked(openDetachedPaginatedQuery).mock.results[0].value;

		firstValue.reject(new Error('boom'));

		await expect(load).rejects.toThrow('boom');
		expect(result.dispose).toHaveBeenCalledOnce();
	});

	it('passes keepAlive: false through to the route-scoped subscription', async () => {
		const load = convexLoadPaginated(mockRef, {}, { initialNumItems: 5, keepAlive: false });
		firstValue.resolve();
		await load;

		expect(openDetachedPaginatedQuery).toHaveBeenCalledWith(
			mockRef,
			{},
			{ initialNumItems: 5, scope: 'route', keepAlive: false, immediate: true }
		);
	});
});

describe('convexLoadPaginated — initial hydration reuses the SSR payload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('looks the first page up by paginated query key (page size included)', async () => {
		const page = { page: [{ id: 1 }], isDone: false, continueCursor: 'c' };
		mockTakeHydratedValue.mockReturnValue({ value: page });

		const result = await convexLoadPaginated(mockRef, { muteWords: [] }, { initialNumItems: 10 });

		expect(mockTakeHydratedValue).toHaveBeenCalledWith(
			'paginated|messages:list|{"muteWords":[]}|10'
		);
		expect(result.results).toEqual([{ id: 1 }]);
		expect(createDetachedPaginatedQuery).toHaveBeenCalledWith(
			mockRef,
			{ muteWords: [] },
			{ initialNumItems: 10, initialData: page, scope: 'route', keepAlive: true }
		);
		expect(openDetachedPaginatedQuery).not.toHaveBeenCalled();
	});

	it('warns (dev) on a miss, and hydrate: false skips lookup and warning', async () => {
		mockTakeHydratedValue.mockReturnValue(undefined);
		const miss = convexLoadPaginated(mockRef, {}, { initialNumItems: 5 });
		firstValue.resolve();
		await miss;
		expect(warnHydrationMiss).toHaveBeenCalledOnce();

		vi.clearAllMocks();
		const optOut = convexLoadPaginated(mockRef, {}, { initialNumItems: 5, hydrate: false });
		firstValue.resolve();
		await optOut;
		expect(mockTakeHydratedValue).not.toHaveBeenCalled();
		expect(warnHydrationMiss).not.toHaveBeenCalled();
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
		expect(() => result.dispose()).not.toThrow();

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
		expect(() => result.dispose()).not.toThrow();

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

describe('transport — route scope and keepAlive survive the SSR boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('round-trips keepAlive through encodeConvexLoad / decodeConvexLoad', () => {
		const encoded = encodeConvexLoad(new ConvexLoadResult('messages:list', {}, [], false));
		expect(encoded).toEqual({ refName: 'messages:list', args: {}, data: [], keepAlive: false });

		decodeConvexLoad(encoded as Exclude<typeof encoded, false>);

		expect(createDetachedQuery).toHaveBeenCalledWith({ _name: 'messages:list' }, {}, [], {
			scope: 'route',
			keepAlive: false
		});
	});

	it('decodes payloads without keepAlive as keepAlive: true', () => {
		decodeConvexLoad({ refName: 'messages:list', args: {}, data: [] });

		expect(createDetachedQuery).toHaveBeenCalledWith({ _name: 'messages:list' }, {}, [], {
			scope: 'route',
			keepAlive: true
		});
	});

	it('round-trips keepAlive through encodeConvexLoadPaginated / decodeConvexLoadPaginated', () => {
		const data = { page: [], isDone: true, continueCursor: '' };
		const encoded = encodeConvexLoadPaginated(
			new ConvexLoadPaginatedResult('messages:paginatedList', {}, 10, data, false)
		);
		expect(encoded).toEqual({
			refName: 'messages:paginatedList',
			args: {},
			initialNumItems: 10,
			data,
			keepAlive: false
		});

		decodeConvexLoadPaginated(encoded as Exclude<typeof encoded, false>);

		expect(createDetachedPaginatedQuery).toHaveBeenCalledWith(
			{ _name: 'messages:paginatedList' },
			{},
			{ initialNumItems: 10, initialData: data, scope: 'route', keepAlive: false }
		);
	});
});
