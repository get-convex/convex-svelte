// Reexport your entry components here

export {
	useConvexClient,
	setupConvex,
	useQuery,
	useMutation,
	useAction,
	setConvexClientContext,
	setupAuth,
	useAuth,
	_authContextKey,
	type UseQueryOptions,
	type UseQueryReturn,
	type FetchAccessToken,
	type ConvexAuthProvider,
	type SetupAuthOptions,
	type UseAuthReturn
} from './client.svelte.js';
export {
	usePaginatedQuery,
	type UsePaginatedQueryOptions,
	type UsePaginatedQueryReturn
} from './use_paginated_query.svelte.js';
export { getConvexClient } from './internal/singleton.js';
