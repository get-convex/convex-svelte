/**
 * Server-side Convex HTTP client helper.
 *
 * Provides `createConvexHttpClient()` — an auth-agnostic factory for
 * `ConvexHttpClient` instances, suitable for use in SvelteKit load functions,
 * form actions, and server hooks.
 */
import { ConvexHttpClient, type ConvexClientOptions } from 'convex/browser';
import { getSingletonUrl, _getServerToken } from '../internal/singleton.js';

export type CreateConvexHttpClientOptions = {
	/** Convex deployment URL. Falls back to the URL set by `initConvex()`. */
	url?: string;
	/** Auth token (JWT) to authenticate server-side requests. */
	token?: string;
	/** Additional ConvexHttpClient options. */
	options?: {
		skipConvexDeploymentUrlCheck?: boolean;
		logger?: ConvexClientOptions['logger'];
	};
};

/**
 * Create a `ConvexHttpClient` for server-side use.
 *
 * @example
 * ```ts
 * // +page.server.ts
 * import { createConvexHttpClient } from 'convex-svelte/sveltekit';
 * import { api } from '$convex/_generated/api';
 *
 * export const load = async ({ locals }) => {
 *   const client = createConvexHttpClient({ token: locals.token });
 *   const tasks = await client.query(api.tasks.get, {});
 *   return { tasks };
 * };
 * ```
 */
export function createConvexHttpClient(args: CreateConvexHttpClientOptions = {}): ConvexHttpClient {
	const url = args.url ?? getSingletonUrl();
	if (!url) {
		throw new Error(
			'No Convex URL provided. Either pass a `url` option or call initConvex() first.'
		);
	}
	const client = new ConvexHttpClient(url, args.options);
	const token = args.token ?? _getServerToken();
	if (token) {
		client.setAuth(token);
	}
	return client;
}
