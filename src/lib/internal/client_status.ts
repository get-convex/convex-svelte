import type { ConvexClient } from 'convex/browser';

type ClientStatus = Pick<ConvexClient, 'closed' | 'disabled'>;

/**
 * Whether the client can accept new subscriptions.
 *
 * Note: `ConvexClient.close()` clears the internal paginated client, so
 * subscribing on a *closed* client throws a misleading "ConvexClient is
 * disabled" error. Subscription paths must check this before subscribing —
 * effects can re-run while still holding a stale client reference, e.g.
 * after `closeConvex()` or during teardown.
 */
export function isClientActive(client: ClientStatus): boolean {
	return !client.disabled && !client.closed;
}
