/**
 * Server-only token context for authenticated SSR in universal load functions.
 *
 * Uses `AsyncLocalStorage` to store the auth token per-request, allowing
 * `convexLoad` and `createConvexHttpClient` to auto-read it during SSR
 * without explicit `{ token }` options.
 *
 * Import from `convex-svelte/sveltekit/server`.
 *
 * @example
 * ```ts
 * // hooks.server.ts
 * import { withServerConvexToken } from 'convex-svelte/sveltekit/server';
 *
 * export const handle: Handle = async ({ event, resolve }) => {
 *   const token = await getToken(event.cookies);
 *   event.locals.token = token;
 *   return withServerConvexToken(token, () => resolve(event));
 * };
 * ```
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { _setServerTokenGetter } from '../internal/singleton.js';

const tokenStorage = new AsyncLocalStorage<string | undefined>();

// Register the getter so convexLoad / createConvexHttpClient can access
// the token without importing node:async_hooks themselves.
_setServerTokenGetter(() => tokenStorage.getStore());

/**
 * Store the auth token for the duration of `fn`, making it available to
 * `convexLoad()` and `createConvexHttpClient()` during SSR.
 *
 * Wrap your SvelteKit `resolve()` call with this in `hooks.server.ts`:
 *
 * ```ts
 * return withServerConvexToken(token, () => resolve(event));
 * ```
 *
 * @param token - The auth token (JWT) for the current request, or `undefined`.
 * @param fn - The function to run with the token in scope (typically `resolve`).
 * @returns The return value of `fn`.
 */
export function withServerConvexToken<T>(token: string | undefined, fn: () => T): T {
	return tokenStorage.run(token, fn);
}
