import { afterEach, describe, expect, it } from 'vitest';
import { initConvex } from './client.js';
import { closeConvex, getSingletonClient } from '../internal/singleton.js';

afterEach(async () => {
	await closeConvex();
});

describe('initConvex', () => {
	it('is idempotent for the same URL', () => {
		const first = initConvex('https://example.convex.cloud');
		const second = initConvex('https://example.convex.cloud');

		expect(second).toBe(first);
		expect(getSingletonClient()).toBe(first);
	});

	it('throws when called with a different URL while a client exists', () => {
		const first = initConvex('https://a.convex.cloud');

		expect(() => initConvex('https://b.convex.cloud')).toThrow(
			'Only one deployment per app is supported'
		);
		// The original client stays intact.
		expect(getSingletonClient()).toBe(first);
	});

	it('accepts a different URL after closeConvex', async () => {
		const first = initConvex('https://a.convex.cloud');
		await closeConvex();

		const second = initConvex('https://b.convex.cloud');
		expect(second).not.toBe(first);
		expect(getSingletonClient()).toBe(second);
	});

	it('rejects an empty URL', () => {
		expect(() => initConvex('')).toThrow('initConvex requires a non-empty URL string');
	});
});
