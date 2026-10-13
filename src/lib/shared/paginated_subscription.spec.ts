import { describe, expect, it, vi } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { subscribePaginated } from './paginated_subscription.js';

// The Convex client can throw instead of calling onError (get-convex/convex-js#193):
// from getCurrentValue() for a failed page, and from onPaginatedUpdate_experimental()
// itself. Those errors must reach onError, and a cleanup must always come back.

const ref = makeFunctionReference<'query'>('messages:paginatedList');
const page = { results: [1], status: 'CanLoadMore' as const, loadMore: () => true };

function clientWith(
	impl: (onUpdate: () => void, onError: (e: Error) => void) => ReturnType<typeof vi.fn>
) {
	return {
		onPaginatedUpdate_experimental: vi.fn(
			(_q: unknown, _a: unknown, _o: unknown, onUpdate: () => void, onError: (e: Error) => void) =>
				impl(onUpdate, onError)
		)
	} as never;
}

describe('subscribePaginated', () => {
	it('reports a failed cached page instead of throwing, and still returns a cleanup', () => {
		const unsubscribe = Object.assign(vi.fn(), {
			getCurrentValue: () => {
				throw new Error('page failed');
			}
		});
		const onSnapshot = vi.fn();
		const onError = vi.fn();

		const cleanup = subscribePaginated(
			clientWith(() => unsubscribe),
			ref,
			{},
			10,
			onSnapshot,
			onError
		);

		expect(onError).toHaveBeenCalledWith(new Error('page failed'));
		expect(onSnapshot).not.toHaveBeenCalled();
		cleanup();
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it('reports an error thrown by onPaginatedUpdate_experimental itself', () => {
		const onError = vi.fn();
		const client = {
			onPaginatedUpdate_experimental: vi.fn(() => {
				throw new Error('failed page held by another subscriber');
			})
		} as never;

		const cleanup = subscribePaginated(client, ref, {}, 10, vi.fn(), onError);

		expect(onError).toHaveBeenCalledWith(new Error('failed page held by another subscriber'));
		expect(() => cleanup()).not.toThrow();
	});

	it('reports a failed page that getCurrentValue() throws inside the update callback', () => {
		let fail = false;
		let notify = () => {};
		const unsubscribe = Object.assign(vi.fn(), {
			getCurrentValue: () => {
				if (fail) throw new Error('page failed');
				return undefined;
			}
		});
		const onError = vi.fn();
		subscribePaginated(
			clientWith((onUpdate) => {
				notify = onUpdate;
				return unsubscribe;
			}),
			ref,
			{},
			10,
			vi.fn(),
			onError
		);

		fail = true;
		notify();

		expect(onError).toHaveBeenCalledWith(new Error('page failed'));
	});

	it('delivers a snapshot the client reports synchronously while subscribing, once', () => {
		const unsubscribe = Object.assign(vi.fn(), { getCurrentValue: () => page });
		const onSnapshot = vi.fn();

		subscribePaginated(
			clientWith((onUpdate) => {
				onUpdate(); // before the subscription is returned
				return unsubscribe;
			}),
			ref,
			{},
			10,
			onSnapshot,
			vi.fn()
		);

		expect(onSnapshot).toHaveBeenCalledOnce();
		expect(onSnapshot).toHaveBeenCalledWith(page);
	});

	it('does not read the value after the client reported an error synchronously', () => {
		const getCurrentValue = vi.fn(() => page);
		const onError = vi.fn();

		subscribePaginated(
			clientWith((_onUpdate, reportError) => {
				reportError(new Error('boom'));
				return Object.assign(vi.fn(), { getCurrentValue });
			}),
			ref,
			{},
			10,
			vi.fn(),
			onError
		);

		expect(onError).toHaveBeenCalledOnce();
		expect(getCurrentValue).not.toHaveBeenCalled();
	});
});
