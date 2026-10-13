import { convexLoad } from '$lib/sveltekit/index.js';
import { api } from '../../../convex/_generated/api.js';

export const load = async ({ fetch }) => ({
	messages: await convexLoad(
		api.messages.list,
		{ muteWords: ['__e2e_auth_hydration__'] },
		{ fetch }
	)
});
