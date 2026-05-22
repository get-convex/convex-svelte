import { createConvexHttpClient } from '$lib/sveltekit/index.js';
import { api } from '../../../convex/_generated/api.js';

export const load = async () => {
	const client = createConvexHttpClient();
	const messages = await client.query(api.messages.list, { muteWords: [] });
	return { messages, messageCount: messages.length };
};
