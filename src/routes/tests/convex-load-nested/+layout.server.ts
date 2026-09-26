import { convexLoad } from '$lib/sveltekit/index.js';
import { api } from '../../../convex/_generated/api.js';

// Server layout load: uses a result only internally — must never be embedded.
export const load = async () => {
	const privateResult = await convexLoad(api.messages.list, {
		muteWords: ['__e2e_nested_server_private__']
	});
	return { serverCount: privateResult.data?.length ?? 0 };
};
