import { ConvexHttpClient } from 'convex/browser';
import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { api } from '../../../convex/_generated/api.js';

export async function load() {
	const client = new ConvexHttpClient(PUBLIC_CONVEX_URL!);
	const initialMessages = await client.query(api.messages.paginatedList, {
		muteWords: [],
		paginationOpts: { numItems: 3, cursor: null }
	});

	return { initialMessages };
}
