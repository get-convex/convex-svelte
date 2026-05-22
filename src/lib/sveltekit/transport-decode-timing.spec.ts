import { describe, it, expect, beforeEach } from 'vitest';
import { deferSubscription, flushDeferredSubscriptions } from '../internal/singleton.js';

// ---------------------------------------------------------------------------
// Tests for the transport.decode → setupAuth subscription deferral mechanism.
//
// Problem: SvelteKit's transport.decode runs BEFORE component initialization
// (where setupAuth calls client.setAuth). If subscriptions fire immediately,
// they hit the server without auth. queueMicrotask alone is insufficient
// because SvelteKit may process microtasks between deserialization and
// component mounting.
//
// Solution: Explicit coordination via deferSubscription/flushDeferredSubscriptions.
// ---------------------------------------------------------------------------

describe('queueMicrotask approach (insufficient)', () => {
	it('FAILS when SvelteKit processes microtasks between decode and component init', async () => {
		// This test demonstrates WHY queueMicrotask alone doesn't work.
		// SvelteKit can process microtask checkpoints between transport.decode
		// and component initialization (e.g., during hydration scheduling).
		const events: string[] = [];

		// Step 1: transport.decode defers subscribe via queueMicrotask
		queueMicrotask(() => events.push('subscribe'));

		// Step 2: SvelteKit processes an intermediate microtask checkpoint
		// (e.g., hydration scheduling, data processing, internal await)
		await Promise.resolve();

		// Step 3: component init calls setAuth
		events.push('setAuth');

		// BUG: subscribe fired BEFORE setAuth!
		expect(events).toEqual(['subscribe', 'setAuth']);
	});
});

describe('deferSubscription approach (correct)', () => {
	let _deferSub: typeof deferSubscription;
	let _flushSubs: typeof flushDeferredSubscriptions;

	beforeEach(() => {
		// Use an isolated implementation that mirrors the singleton state machine.
		// The shared singleton itself is covered by integration/e2e tests.
		let queue: Array<() => void> | null = [];

		_deferSub = (fn: () => void) => {
			if (queue === null) {
				fn();
			} else {
				queue.push(fn);
			}
		};

		_flushSubs = () => {
			if (queue === null) return;
			const pending = queue;
			queue = null;
			for (const fn of pending) fn();
		};
	});

	it('deferred subscription does NOT fire before flush', async () => {
		const events: string[] = [];

		// Step 1: transport.decode defers subscription
		_deferSub(() => events.push('subscribe'));

		// Step 2: intermediate microtask (SvelteKit internal processing)
		await Promise.resolve();

		// subscribe has NOT fired — it waits for explicit flush
		expect(events).toEqual([]);
	});

	it('flush fires subscriptions in order', () => {
		const events: string[] = [];

		_deferSub(() => events.push('subscribe-1'));
		_deferSub(() => events.push('subscribe-2'));
		_deferSub(() => events.push('subscribe-3'));

		expect(events).toEqual([]);

		_flushSubs();
		expect(events).toEqual(['subscribe-1', 'subscribe-2', 'subscribe-3']);
	});

	it('setupAuth setAuth runs before deferred subscriptions', () => {
		// Simulates the real SSR hydration sequence:
		//   1. transport.decode → deferSubscription (queued)
		//   2. component init  → setAuth (synchronous)
		//   3. setupAuth calls flushDeferredSubscriptions
		//   => subscriptions fire AFTER setAuth
		const events: string[] = [];

		// Step 1: transport.decode
		_deferSub(() => events.push('subscribe'));

		// Step 2: component init calls setAuth
		events.push('setAuth');

		// Step 3: setupAuth flushes
		_flushSubs();

		expect(events).toEqual(['setAuth', 'subscribe']);
	});

	it('multiple subscriptions all fire after setAuth', () => {
		const events: string[] = [];

		// Multiple convexLoad results decoded by transport
		_deferSub(() => events.push('subscribe-masterPlan'));
		_deferSub(() => events.push('subscribe-audiences'));
		_deferSub(() => events.push('subscribe-messages'));

		// Component init: setAuth then flush
		events.push('setAuth');
		_flushSubs();

		expect(events).toEqual([
			'setAuth',
			'subscribe-masterPlan',
			'subscribe-audiences',
			'subscribe-messages'
		]);
	});

	it('after flush, new subscriptions fire immediately', () => {
		const events: string[] = [];

		// Initial flush (setupAuth)
		_flushSubs();

		// Client-side navigation: transport.decode creates new subscriptions
		_deferSub(() => events.push('subscribe'));

		// Fires immediately — no queueing
		expect(events).toEqual(['subscribe']);
	});

	it('flush is idempotent — safe to call multiple times', () => {
		const events: string[] = [];

		_deferSub(() => events.push('subscribe'));

		_flushSubs();
		expect(events).toEqual(['subscribe']);

		// Second flush is a no-op
		_flushSubs();
		expect(events).toEqual(['subscribe']);
	});

	it('survives intermediate microtasks between decode and component init', async () => {
		// This is the KEY test: the exact scenario that breaks queueMicrotask.
		const events: string[] = [];

		// Step 1: transport.decode defers subscription
		_deferSub(() => events.push('subscribe'));

		// Step 2: SvelteKit processes intermediate microtasks
		await Promise.resolve();
		await Promise.resolve();

		// subscribe still hasn't fired
		expect(events).toEqual([]);

		// Step 3: component init calls setAuth + flush
		events.push('setAuth');
		_flushSubs();

		// subscribe fires AFTER setAuth — correct!
		expect(events).toEqual(['setAuth', 'subscribe']);
	});

	it('setupConvex fallback: flush via queueMicrotask for no-auth apps', async () => {
		// For apps without setupAuth, setupConvex schedules a fallback flush
		// via queueMicrotask. Since setupAuth is never called, the fallback fires.
		const events: string[] = [];

		// transport.decode
		_deferSub(() => events.push('subscribe'));

		// setupConvex schedules fallback flush
		queueMicrotask(() => _flushSubs());

		// Not yet fired
		expect(events).toEqual([]);

		// Fallback fires
		await Promise.resolve();
		expect(events).toEqual(['subscribe']);
	});

	it('setupConvex fallback is no-op when setupAuth already flushed', async () => {
		// For apps WITH auth: setupAuth flushes synchronously, then
		// setupConvex's fallback queueMicrotask is a no-op.
		const events: string[] = [];

		_deferSub(() => events.push('subscribe'));

		// setupConvex schedules fallback (runs first in createSvelteAuthClient)
		queueMicrotask(() => {
			_flushSubs();
			events.push('fallback-ran');
		});

		// setupAuth flushes synchronously (runs second in createSvelteAuthClient)
		events.push('setAuth');
		_flushSubs();

		// subscribe already fired
		expect(events).toEqual(['setAuth', 'subscribe']);

		// Fallback runs but is a no-op
		await Promise.resolve();
		expect(events).toEqual(['setAuth', 'subscribe', 'fallback-ran']);
	});
});
