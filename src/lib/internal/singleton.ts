/**
 * Shared module-level ConvexClient singleton.
 *
 * Used by:
 * - `initConvex()` (sveltekit sub-path) to register an early-init client
 * - `setupConvex()` (core) to reuse it instead of creating a new one
 *
 * This avoids a circular dependency between core and sveltekit.
 */
import type { ConvexClient } from 'convex/browser';

let _singletonClient: ConvexClient | null = null;
let _singletonUrl: string | null = null;

// ---------------------------------------------------------------------------
// Deferred subscription queue for transport.decode → setupAuth coordination.
//
// Problem: SvelteKit's transport.decode (which calls createDetachedQuery)
// runs BEFORE component initialization (where setupAuth calls client.setAuth).
// If subscriptions fire immediately, they hit the server without auth,
// causing Unauthenticated errors and overwriting SSR data for soft-auth queries.
//
// Solution: transport.decode queues subscriptions via deferSubscription().
// setupAuth (or setupConvex for no-auth apps) calls flushDeferredSubscriptions()
// after client.setAuth() to fire them with auth ready.
// ---------------------------------------------------------------------------
let _deferredSubscriptions: Array<() => void> | null = [];

/**
 * Queue a subscription to fire after auth is ready.
 * If already flushed (auth ready), fires immediately.
 */
export function deferSubscription(fn: () => void): void {
	if (_deferredSubscriptions === null) {
		// Already flushed — auth is ready, fire immediately
		fn();
	} else {
		_deferredSubscriptions.push(fn);
	}
}

/**
 * Flush all deferred subscriptions and switch to immediate mode.
 * Called by setupAuth() after client.setAuth(), or by setupConvex()
 * as a fallback for no-auth apps.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function flushDeferredSubscriptions(): void {
	if (_deferredSubscriptions === null) return;
	const pending = _deferredSubscriptions;
	_deferredSubscriptions = null; // Switch to immediate mode
	for (const fn of pending) fn();
}

export function getSingletonClient(): ConvexClient | null {
	return _singletonClient;
}

export function getSingletonUrl(): string | null {
	return _singletonUrl;
}

export function setSingleton(url: string, client: ConvexClient): void {
	_singletonUrl = url;
	_singletonClient = client;
}

/**
 * Get the module-level ConvexClient singleton.
 * Works anywhere (hooks, transport, utilities) — does not require Svelte context.
 *
 * @throws If `initConvex()` or `setupConvex()` has not been called yet.
 */
// ---------------------------------------------------------------------------
// Server-side token indirection for AsyncLocalStorage.
//
// server-token.ts (server-only) registers a getter via _setServerTokenGetter
// that reads from AsyncLocalStorage. convexLoad and createConvexHttpClient
// call _getServerToken() to auto-read the token during SSR — without
// importing node:async_hooks themselves (which would break in the browser).
// ---------------------------------------------------------------------------
let _serverTokenGetter: (() => string | undefined) | null = null;

/**
 * Register a function that retrieves the current request's auth token.
 * Called once by `server-token.ts` on import (side-effect registration).
 * @internal
 */
export function _setServerTokenGetter(getter: () => string | undefined): void {
	_serverTokenGetter = getter;
}

/**
 * Read the auth token for the current request, if available.
 * Returns `undefined` when `withServerConvexToken` is not active or
 * when the server-token module has not been imported.
 * @internal
 */
export function _getServerToken(): string | undefined {
	return _serverTokenGetter?.();
}

export function getConvexClient(): ConvexClient {
	if (!_singletonClient) {
		throw new Error('Convex client not initialized. Call setupConvex() or initConvex() first.');
	}
	return _singletonClient;
}

/**
 * Get the stored Convex deployment URL.
 *
 * @throws If `initConvex()` or `setupConvex()` has not been called yet.
 */
export function getConvexUrl(): string {
	if (!_singletonUrl) {
		throw new Error('Convex URL not set. Call setupConvex() or initConvex() first.');
	}
	return _singletonUrl;
}
