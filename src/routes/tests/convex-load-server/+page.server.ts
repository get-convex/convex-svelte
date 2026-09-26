import { convexLoad } from '$lib/sveltekit/index.js';
import { api } from '../../../convex/_generated/api.js';

// Server load: the result it returns reaches the browser through the transport
// hook. The second query is only used on the server (think: private fields the
// page must not expose) — convexLoadHydration must never put it in the HTML.
export const load = async () => {
	const privateResult = await convexLoad(api.messages.list, {
		muteWords: ['__e2e_server_private__']
	});
	return {
		messages: await convexLoad(api.messages.list, { muteWords: ['__e2e_server_load__'] }),
		privateCount: privateResult.data?.length ?? 0
	};
};
