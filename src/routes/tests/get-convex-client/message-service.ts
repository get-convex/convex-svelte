import { getConvexClient } from '$lib/index.js';
import { api } from '../../../convex/_generated/api.js';

/**
 * Example business-logic utility that calls mutations from a plain .ts file
 * (no Svelte component context needed). Uses getConvexClient() instead of
 * useConvexClient() which requires getContext().
 */
export async function sendTestMessage(author: string, body: string): Promise<void> {
	const client = getConvexClient();
	await client.mutation(api.messages.send, { author, body });
}

export async function deleteTestMessages(author: string): Promise<void> {
	const client = getConvexClient();
	await client.mutation(api.messages.deleteByAuthor, { author });
}
