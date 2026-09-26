/**
 * Stable identity of a query and its arguments.
 *
 * Used to deduplicate idle route-scoped queries and to match `convexLoad`
 * results embedded in the SSR payload with the loads that re-run during
 * hydration — so the server and the browser must compute the same key.
 */
import type { Value } from 'convex/values';
import { serializeArgsKey } from '../shared/paginated_query_state.js';

/** Key for a regular query, e.g. `messages:list|{"muteWords":[]}`. */
export function queryKey(functionName: string, args: Record<string, unknown>): string {
	return `${functionName}|${serializeArgsKey(args as Record<string, Value>)}`;
}

/** Key for a paginated query; the page size is part of its identity. */
export function paginatedQueryKey(
	functionName: string,
	args: Record<string, unknown>,
	initialNumItems: number
): string {
	return `paginated|${queryKey(functionName, args)}|${initialNumItems}`;
}
