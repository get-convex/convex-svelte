import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConvexClient } from 'convex/browser';
import { closeConvex, getConvexClient, getSingletonClient, setSingleton } from './singleton.js';

afterEach(async () => {
	await closeConvex();
});

describe('Convex client singleton', () => {
	it('does not reuse a closed client', () => {
		const closedClient = { closed: true } as unknown as ConvexClient;

		setSingleton('https://example.convex.cloud', closedClient);

		expect(getSingletonClient()).toBeNull();
		expect(() => getConvexClient()).toThrow(
			'Convex client not initialized. Call setupConvex() or initConvex() first.'
		);
	});

	it('closeConvex closes the client and clears the singleton', async () => {
		const close = vi.fn(async () => {});
		const client = { closed: false, close } as unknown as ConvexClient;
		setSingleton('https://example.convex.cloud', client);

		await closeConvex();

		expect(close).toHaveBeenCalledTimes(1);
		expect(getSingletonClient()).toBeNull();
	});

	it('closeConvex is safe without an initialized client', async () => {
		await expect(closeConvex()).resolves.toBeUndefined();
	});

	it('allows a fresh client after closeConvex', async () => {
		const first = { closed: false, close: vi.fn(async () => {}) } as unknown as ConvexClient;
		setSingleton('https://a.convex.cloud', first);
		await closeConvex();

		const second = { closed: false, close: vi.fn(async () => {}) } as unknown as ConvexClient;
		setSingleton('https://b.convex.cloud', second);

		expect(getSingletonClient()).toBe(second);
	});
});
