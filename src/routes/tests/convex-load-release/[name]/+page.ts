import { convexLoad } from '$lib/sveltekit/index.js';
import { api } from '../../../../convex/_generated/api.js';

// Each page subscribes with unique args, so the e2e test can tell the
// subscriptions apart in the WebSocket frames. `?keepAlive=false` disables
// the idle buffer for this query.
export const load = async ({ params, url }) => ({
	name: params.name,
	keepAlive: url.searchParams.get('keepAlive') !== 'false',
	messages: await convexLoad(
		api.messages.list,
		{ muteWords: [`__e2e_release_${params.name}__`] },
		{ keepAlive: url.searchParams.get('keepAlive') !== 'false' }
	)
});
