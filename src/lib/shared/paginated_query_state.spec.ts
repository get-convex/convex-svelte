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
