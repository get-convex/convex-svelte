/**
 * Options of the shared ConvexClient.
 *
 * Like `new ConvexReactClient(url, options)` in React, client options can only
 * take effect where the client is created: `initConvex()` (SvelteKit, in
 * `hooks.ts`) or the first `setupConvex()`. Later calls reuse the client, so
 * options they pass are reported instead of silently dropped.
 */
import { DEV } from 'esm-env';
import type { ConvexClientOptions } from 'convex/browser';

const isServer = () => typeof globalThis.document === 'undefined';

/**
 * Options for a new client. On the server the client is always disabled, so
 * server rendering never opens a WebSocket — even if a caller passes
 * `disabled: false`. Decided at runtime rather than by build-time conditions,
 * so it can't go wrong with how a bundler resolves packages.
 */
export function withServerDisabled(options: ConvexClientOptions): ConvexClientOptions {
	return { ...options, disabled: isServer() || options.disabled === true };
}

/**
 * Names of `requested` options that differ from the ones the client was
 * created with. Only primitive values are compared: functions and objects
 * (e.g. `logger`) get a new identity on every hot reload. `disabled` is
 * managed by convex-svelte.
 */
export function differingOptions(
	created: ConvexClientOptions,
	requested: ConvexClientOptions
): string[] {
	return Object.entries(requested)
		.filter(([name, value]) => {
			if (name === 'disabled' || (typeof value === 'object' && value !== null)) return false;
			if (typeof value === 'function') return false;
			return created[name as keyof ConvexClientOptions] !== value;
		})
		.map(([name]) => name);
}

/**
 * Dev only, in the browser (where the options matter): report options that a
 * call passed for a client that already exists.
 */
export function warnIgnoredOptions(
	caller: 'setupConvex' | 'initConvex',
	created: ConvexClientOptions,
	requested: ConvexClientOptions
): void {
	if (!DEV || isServer()) return;
	const ignored = differingOptions(created, requested);
	if (ignored.length === 0) return;
	console.warn(
		`[convex-svelte] ${caller}(): the Convex client already exists, so these options are ` +
			`ignored: ${ignored.join(', ')}. Client options only take effect where the client is ` +
			'created, e.g. initConvex(url, options) in src/hooks.ts.'
	);
}
