import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

type QueryArgs = Record<string, unknown>;

export type QueryEvent = {
	type: 'Add' | 'Remove';
	queryId: number;
	udfPath: string;
	args: QueryArgs;
};

export type WebSocketEvent = QueryEvent | { type: 'Authenticate' };

type ModifyQuerySet = {
	type: 'ModifyQuerySet';
	modifications: Array<
		| { type: 'Add'; queryId: number; udfPath: string; args: QueryArgs[] }
		| { type: 'Remove'; queryId: number }
	>;
};

/**
 * Record the Convex protocol messages a page sends: query subscriptions
 * (Add/Remove, with their function and args) and authentication.
 */
export function recordWebSocket(page: Page) {
	const events: WebSocketEvent[] = [];
	const addsById = new Map<number, QueryEvent>();

	page.on('websocket', (ws) => {
		ws.on('framesent', ({ payload }) => {
			if (typeof payload !== 'string') return;
			const message = JSON.parse(payload) as { type: string };
			if (message.type === 'Authenticate') {
				events.push({ type: 'Authenticate' });
				return;
			}
			if (message.type !== 'ModifyQuerySet') return;
			for (const modification of (message as ModifyQuerySet).modifications) {
				if (modification.type === 'Add') {
					const add: QueryEvent = {
						type: 'Add',
						queryId: modification.queryId,
						udfPath: modification.udfPath,
						args: modification.args[0] ?? {}
					};
					addsById.set(add.queryId, add);
					events.push(add);
				} else {
					const add = addsById.get(modification.queryId);
					if (add) events.push({ ...add, type: 'Remove' });
				}
			}
		});
	});

	return {
		events,
		/** Position in the event log, to only look at later events. */
		mark: () => events.length,
		/** Add/Remove events of queries matching `predicate`, from `since` on. */
		queryEvents: (predicate: (event: QueryEvent) => boolean, since = 0) =>
			events
				.slice(since)
				.filter((event): event is QueryEvent => event.type !== 'Authenticate' && predicate(event))
	};
}

/** Match queries whose `muteWords` arg contains `marker` (test pages use unique markers). */
export const withMuteWord = (marker: string) => (event: QueryEvent) =>
	Array.isArray(event.args.muteWords) && event.args.muteWords.includes(marker);

/** The deployment URL from `.env.local` (or the environment). */
export function convexUrl(): string {
	if (process.env.PUBLIC_CONVEX_URL) return process.env.PUBLIC_CONVEX_URL;
	const env = readFileSync('.env.local', 'utf8');
	const url = env.match(/^PUBLIC_CONVEX_URL=(.+)$/m)?.[1]?.trim();
	if (!url) throw new Error('PUBLIC_CONVEX_URL not found in .env.local');
	return url;
}
