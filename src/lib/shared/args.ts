import { convexToJson, type Value } from 'convex/values';
import type { MaybeSkipArgsOrFn } from './types.js';

/**
 * A symbol used internally to represent "skip".
 *
 * We don’t propagate the literal string "skip" through all layers, because:
 *   - Symbols can’t collide with user data.
 *   - They give us a clear sentinel for equality checks.
 *
 * Any client (React/Svelte/Vue/Solid/…) *may* choose to use this sentinel
 * internally. Svelte already does; React could adopt it later even though
 * today it handles "skip" inline in the hook.
 */
export const SKIP = Symbol('convex.useQuery.skip');
export type Skip = typeof SKIP;

/**
 * Normalize user-provided query args into a stable discriminated union.
 *
 * Supported input shapes:
 *   - A plain args object: `{ channel: "#general" }`
 *   - The string `"skip"` (meaning: do not subscribe / do not run this query)
 *   - A closure returning either of the above
 *
 * Current frameworks:
 *   - React: today typically passes plain args or "skip" directly and can
 *            call `normalizeArgs` *without* using the function form.
 *   - Svelte/Vue/Solid: can take advantage of the function form to keep
 *            args reactive without re-creating objects in user code.
 *
 * Why this is shared:
 *   - It centralizes the semantics of "skip" vs. normal args.
 *   - It allows non-React clients to share the same behavior instead of
 *     re-implementing their own "skip" logic.
 */
export function normalizeArgs(
	input: MaybeSkipArgsOrFn
): { skip: true; args: undefined } | { skip: false; args: Record<string, Value> } {
	if (typeof input === 'function') {
		input = input();
	}

	if (input === 'skip') {
		return { skip: true, args: undefined };
	}

	//  If parseArgs from convex/common would be shared we could also use it here
	//  const parsed = parseArgs(input);
	return { skip: false, args: input };
}

/**
 * Compare two argument objects by value using Convex's canonical JSON form.
 *
 * Implementation detail:
 *   - We run both objects through `convexToJson` and then JSON.stringify,
 *     which is how existing clients already compare args for equality.
 *
 * Current usage:
 *   - React and Svelte both effectively perform this comparison today
 *     (React inside its hooks, Svelte in its internal helpers).
 *
 * Why this is shared:
 *   - Keeps argument equality semantics identical across all clients.
 *   - Avoids re-implementing "JSON.stringify(convexToJson())" in each framework.
 */
export function jsonEqualArgs(a: Record<string, Value>, b: Record<string, Value>): boolean {
	return JSON.stringify(convexToJson(a)) === JSON.stringify(convexToJson(b));
}

/**
 * Compare two "argument keys" that may represent either:
 *   - A real args object, or
 *   - The SKIP sentinel.
 *
 * Rules:
 *   - SKIP vs SKIP → equal
 *   - SKIP vs object → not equal
 *   - object vs object → compare via `jsonEqualArgs`
 *
 * Current usage:
 *   - Svelte uses this pattern already to reason about “have args changed?”.
 *   - React could adopt the same helper if/when it uses a shared SKIP sentinel.
 *
 * Why this is shared:
 *   - Any client that models "skip" as a real sentinel instead of a bare string
 *     needs this exact comparison logic.
 */
export function argsKeyEqual(
	a: Record<string, Value> | Skip,
	b: Record<string, Value> | Skip
): boolean {
	if (a === SKIP && b === SKIP) return true;
	if (a === SKIP || b === SKIP) return false;
	return jsonEqualArgs(a, b);
}
