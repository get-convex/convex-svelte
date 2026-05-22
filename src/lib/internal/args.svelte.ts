import { normalizeArgs, SKIP, type Skip } from '$lib/shared/args.js';
import type { MaybeSkipArgsOrFn } from '$lib/shared/types.js';
import type { Value } from 'convex/values';

/**
 *  args can be an object, "skip", or a closure returning either
 **/
export function parseArgsWithSkip(input: MaybeSkipArgsOrFn): Record<string, Value> | Skip {
	const { skip, args } = normalizeArgs(input);
	if (skip) return SKIP;
	return $state.snapshot(args as Record<string, unknown>) as Record<string, Value>;
}
