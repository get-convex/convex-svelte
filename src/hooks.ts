import {
	initConvex,
	encodeConvexLoad,
	decodeConvexLoad,
	encodeConvexLoadPaginated,
	decodeConvexLoadPaginated
} from '$lib/sveltekit/index.js';
import { PUBLIC_CONVEX_URL } from '$env/static/public';

// Initialize the Convex singleton on both server and client.
// This ensures getConvexUrl() is available during SSR load functions.
initConvex(PUBLIC_CONVEX_URL);

export const transport = {
	ConvexLoadResult: {
		encode: encodeConvexLoad,
		decode: decodeConvexLoad
	},
	ConvexLoadPaginatedResult: {
		encode: encodeConvexLoadPaginated,
		decode: decodeConvexLoadPaginated
	}
};
