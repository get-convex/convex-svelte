import { api } from '../convex/_generated/api.js';
import type { PageServerLoad } from './$types.js';

export const load = (async ({ locals: { convex } }) => {
	return {
		messages: await convex.query(api.messages.list, { muteWords: [] })
	};
}) satisfies PageServerLoad;
