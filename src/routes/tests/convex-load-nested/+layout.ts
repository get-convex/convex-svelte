import { convexLoad } from '$lib/sveltekit/index.js';
import { api } from '../../../convex/_generated/api.js';

// Universal layout load alongside a server layout load.
export const load = async ({ data, fetch }) => ({
	...data,
	layoutMessages: await convexLoad(
		api.messages.list,
		{ muteWords: ['__e2e_nested_layout__'] },
		{ fetch }
	)
});
