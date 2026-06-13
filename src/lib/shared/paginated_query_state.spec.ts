import { describe, expect, it } from 'vitest';
import { PaginatedQueryStateMachine } from './paginated_query_state.js';

describe('PaginatedQueryStateMachine keepPreviousData', () => {
	it('keeps previous results while a new args subscription is loading first page', () => {
		const loadMore = () => false;
		const machine = new PaginatedQueryStateMachine<string>({
			initialNumItems: 3,
			keepPreviousData: true
		});

		machine.onArgsChange(JSON.stringify({ searchWords: ['lo'] }));
		machine.onUpdate({
			results: ['lorem', 'hello'],
			status: 'CanLoadMore',
			loadMore
		});

		machine.onArgsChange(JSON.stringify({ searchWords: ['lor'] }));
		machine.onUpdate({
			results: [],
			status: 'LoadingFirstPage',
			loadMore
		});

		expect(machine.getSnapshot()).toMatchObject({
			results: ['lorem', 'hello'],
			status: 'LoadingFirstPage',
			isLoading: true,
			error: undefined
		});
	});

	it('clears previous results when the new args resolve to an empty page', () => {
		const loadMore = () => false;
		const machine = new PaginatedQueryStateMachine<string>({
			initialNumItems: 3,
			keepPreviousData: true
		});

		machine.onArgsChange(JSON.stringify({ searchWords: ['lo'] }));
		machine.onUpdate({
			results: ['lorem', 'hello'],
			status: 'CanLoadMore',
			loadMore
		});

		machine.onArgsChange(JSON.stringify({ searchWords: ['xyz'] }));
		machine.onUpdate({
			results: [],
			status: 'Exhausted',
			loadMore
		});

		expect(machine.getSnapshot()).toMatchObject({
			results: [],
			status: 'Exhausted',
			isLoading: false,
			error: undefined
		});
	});

	it('queues loadMore called before the live subscription is ready', () => {
		// SSR initialData reports CanLoadMore immediately, but the underlying
		// subscription has no working loadMore until its first server update.
		const machine = new PaginatedQueryStateMachine<string>({
			initialNumItems: 3,
			initialData: { page: ['a', 'b', 'c'], isDone: false, continueCursor: 'cursor-1' }
		});
		machine.onArgsChange(JSON.stringify({}));

		expect(machine.getSnapshot().status).toBe('CanLoadMore');

		// Click "load more" before the subscription delivered anything.
		expect(machine.loadMore(3)).toBe(true);
		// The request is accepted (queued), and further clicks are no-ops.
		expect(machine.getSnapshot().status).toBe('LoadingMore');
		expect(machine.loadMore(3)).toBe(false);

		// The subscription delivers its first page; the queued request fires.
		const loadMoreCalls: number[] = [];
		machine.onUpdate({
			results: ['a', 'b', 'c'],
			status: 'CanLoadMore',
			loadMore: (numItems) => {
				loadMoreCalls.push(numItems);
				return true;
			}
		});

		expect(loadMoreCalls).toEqual([3]);
		expect(machine.getSnapshot().status).toBe('LoadingMore');

		// The grown result set arrives; the queue must not fire again.
		machine.onUpdate({
			results: ['a', 'b', 'c', 'd', 'e', 'f'],
			status: 'CanLoadMore',
			loadMore: (numItems) => {
				loadMoreCalls.push(numItems);
				return true;
			}
		});
		expect(loadMoreCalls).toEqual([3]);
		expect(machine.getSnapshot().results).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
	});

	it('drops a queued loadMore when the live first page is exhausted', () => {
		const machine = new PaginatedQueryStateMachine<string>({
			initialNumItems: 3,
			initialData: { page: ['a', 'b', 'c'], isDone: false, continueCursor: 'cursor-1' }
		});
		machine.onArgsChange(JSON.stringify({}));
		expect(machine.loadMore(3)).toBe(true);

		const loadMoreCalls: number[] = [];
		machine.onUpdate({
			results: ['a', 'b', 'c'],
			status: 'Exhausted',
			loadMore: (numItems) => {
				loadMoreCalls.push(numItems);
				return true;
			}
		});

		expect(loadMoreCalls).toEqual([]);
		expect(machine.getSnapshot().status).toBe('Exhausted');
	});

	it('drops a queued loadMore when args change', () => {
		const machine = new PaginatedQueryStateMachine<string>({
			initialNumItems: 3,
			initialData: { page: ['a', 'b', 'c'], isDone: false, continueCursor: 'cursor-1' }
		});
		machine.onArgsChange(JSON.stringify({ search: '' }));
		expect(machine.loadMore(3)).toBe(true);

		machine.onArgsChange(JSON.stringify({ search: 'new' }));

		const loadMoreCalls: number[] = [];
		machine.onUpdate({
			results: ['x'],
			status: 'CanLoadMore',
			loadMore: (numItems) => {
				loadMoreCalls.push(numItems);
				return true;
			}
		});

		expect(loadMoreCalls).toEqual([]);
	});

	it('uses the latest keepPreviousData option when args change', () => {
		const loadMore = () => false;
		const machine = new PaginatedQueryStateMachine<string>({
			initialNumItems: 3,
			keepPreviousData: true
		});

		machine.onArgsChange(JSON.stringify({ searchWords: ['lo'] }));
		machine.onUpdate({
			results: ['lorem', 'hello'],
			status: 'CanLoadMore',
			loadMore
		});

		machine.updateConfig({ keepPreviousData: false });
		machine.onArgsChange(JSON.stringify({ searchWords: ['lor'] }));

		expect(machine.getSnapshot()).toMatchObject({
			results: [],
			status: 'LoadingFirstPage',
			isLoading: true,
			error: undefined
		});
	});
});
