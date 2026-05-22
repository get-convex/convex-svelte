import { convexLoadPaginated } from '$lib/sveltekit/index.js';
import { api } from '../../../convex/_generated/api.js';

export const load = async () => ({
	messages: await convexLoadPaginated(
		api.messages.paginatedList,
		{ muteWords: [] },
		{
			initialNumItems: 3
		}
	)
});
