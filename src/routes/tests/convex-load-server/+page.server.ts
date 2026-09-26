import { convexLoad } from '$lib/sveltekit/index.js';
import { api } from '../../../convex/_generated/api.js';

// Server load: the result reaches the browser through the transport hook, so
// convexLoadHydration must not embed it in the HTML a second time.
export const load = async () => ({
	messages: await convexLoad(api.messages.list, { muteWords: ['__e2e_server_load__'] })
});
