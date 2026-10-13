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

// The token is wrapped so "inside withServerConvexToken, signed out" (token
// undefined) differs from "outside withServerConvexToken" (no store).
const tokenStorage = new AsyncLocalStorage<{ token: string | undefined }>();
let used = false;

// Register the getter so convexLoad / createConvexHttpClient can access
// the token without importing node:async_hooks themselves.
_setServerTokenGetter(() => tokenStorage.getStore()?.token);

/**
 * Whether the current code runs inside `withServerConvexToken`, and whether the
 * app uses it at all. Lets the `convexLoadHydration` endpoint detect a handle
 * order in which it runs before the auth handle.
 * @internal
 */
export function _serverTokenContext(): { inside: boolean; used: boolean } {
	return { inside: tokenStorage.getStore() !== undefined, used };
}

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
	used = true;
	return tokenStorage.run({ token }, fn);
}
