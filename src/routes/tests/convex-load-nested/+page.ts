import { convexLoad } from '$lib/sveltekit/index.js';
import { api } from '../../../convex/_generated/api.js';

// Universal page load that waits for its parents first.
export const load = async ({ parent }) => {
	await parent();
	return {
		pageMessages: await convexLoad(api.messages.list, { muteWords: ['__e2e_nested_page__'] })
	};
};
