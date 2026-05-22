// SvelteKit-specific Convex integration
// Import from 'convex-svelte/sveltekit'

// Client lifecycle (module singleton)
export { initConvex } from './client.js';
export { getConvexUrl, _getServerToken } from '../internal/singleton.js';

// Server-side HTTP client
export { createConvexHttpClient, type CreateConvexHttpClientOptions } from './server.js';

// Detached query (non-component subscriptions)
export { createDetachedQuery, type DetachedQueryResult } from './query-detached.svelte.js';

// Detached paginated query (non-component paginated subscriptions)
export {
	createDetachedPaginatedQuery,
	type DetachedPaginatedQueryResult
} from './paginated-query-detached.svelte.js';

// SSR transport bridge
export {
	convexLoad,
	ConvexLoadResult,
	encodeConvexLoad,
	decodeConvexLoad,
	convexLoadPaginated,
	ConvexLoadPaginatedResult,
	encodeConvexLoadPaginated,
	decodeConvexLoadPaginated
} from './transport.svelte.js';
