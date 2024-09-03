import { PUBLIC_CONVEX_URL } from '$env/static/public';
import type { Handle } from '@sveltejs/kit';
import { ConvexHttpClient } from 'convex/browser';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.convex = new ConvexHttpClient(PUBLIC_CONVEX_URL);
	return resolve(event);
};
