import { describe, expect, it } from 'vitest';
import { ConvexClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { isClientActive } from './client_status.js';

function clientStatus(
	disabled: boolean,
	closed: boolean
): Pick<ConvexClient, 'disabled' | 'closed'> {
	return { disabled, closed };
}

describe('isClientActive', () => {
	it('treats enabled open clients as active', () => {
		expect(isClientActive(clientStatus(false, false))).toBe(true);
	});

	it('treats disabled clients as inactive', () => {
		expect(isClientActive(clientStatus(true, false))).toBe(false);
	});

	it('treats closed clients as inactive', () => {
		expect(isClientActive(clientStatus(false, true))).toBe(false);
	});

	// Regression test for the HMR crash: when the layout running setupConvex
	// is hot-replaced, its teardown used to close the singleton client while
	// child query effects re-ran against it. ConvexClient.close() clears the
	// internal paginated client, so subscribing afterwards throws the
	// misleading "ConvexClient is disabled" error even though the client was
	// closed, not disabled. isClientActive is the guard subscription paths
	// must use before subscribing.
	it('guards against subscribing on a closed (not disabled) real ConvexClient', async () => {
		const client = new ConvexClient('https://example.convex.cloud', {
			unsavedChangesWarning: false
		});
		await client.close();

		expect(client.disabled).toBe(false);
		expect(client.closed).toBe(true);
		expect(() =>
			client.onPaginatedUpdate_experimental(
				anyApi.messages.paginatedList,
				{},
				{ initialNumItems: 3 },
				() => {}
			)
		).toThrow('ConvexClient is disabled');

		expect(isClientActive(client)).toBe(false);
	});
});
