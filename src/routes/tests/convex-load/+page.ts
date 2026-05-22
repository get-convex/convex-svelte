import { convexLoad } from '$lib/sveltekit/index.js';
import { api } from '../../../convex/_generated/api.js';

export const load = async () => ({
	messages: await convexLoad(api.messages.list, { muteWords: [] })
});
