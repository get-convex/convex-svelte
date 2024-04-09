import { ConvexHttpClient } from 'convex/browser';
import type { PageServerLoad } from './$types.js';
import { env } from '$env/dynamic/public';
import { api } from '../convex/_generated/api.js';

export const load = (async () => {
	const client = new ConvexHttpClient(env.PUBLIC_CONVEX_URL!);
	return {
		messages: await client.query(api.messages.list, { muteWords: [] })
	};
}) satisfies PageServerLoad;
