import { getContext, setContext, untrack } from 'svelte';
import { ConvexClient, type ConvexClientOptions } from 'convex/browser';
import {
	type FunctionReference,
	type FunctionArgs,
	type FunctionReturnType,
	getFunctionName
} from 'convex/server';
import { convexToJson, type Value } from 'convex/values';
import { BROWSER } from 'esm-env';

const _contextKey = '$$_convexClient';

export const useConvexClient = (): ConvexClient => {
	const client = getContext(_contextKey) as ConvexClient | undefined;
	if (!client) {
		throw new Error(
			'No ConvexClient was found in Svelte context. Did you forget to call setupConvex() in a parent component?'
		);
	}
	return client;
};

export const setConvexClientContext = (client: ConvexClient): void => {
	setContext(_contextKey, client);
};

export const setupConvex = (url: string, options: ConvexClientOptions = {}) => {
	if (!url || typeof url !== 'string') {
		throw new Error('Expected string url property for setupConvex');
	}
	const optionsWithDefaults = { disabled: !BROWSER, ...options };

	const client = new ConvexClient(url, optionsWithDefaults);
	setConvexClientContext(client);
	$effect(() => () => client.close());
};

// Internal sentinel for "skip" so we don't pass the literal string through everywhere
const SKIP = Symbol('convex.useQuery.skip');
type Skip = typeof SKIP;

type UseQueryOptions<Query extends FunctionReference<'query'>> = {
	// Use this data and assume it is up to date (typically for SSR and hydration)
	initialData?: FunctionReturnType<Query>;
	// Instead of loading, render result from outdated args
	keepPreviousData?: boolean;
};

type UseQueryReturn<Query extends FunctionReference<'query'>> =
	| { data: undefined; error: undefined; isLoading: true; isStale: false }
	| { data: undefined; error: Error; isLoading: false; isStale: boolean }
	| { data: FunctionReturnType<Query>; error: undefined; isLoading: false; isStale: boolean };

// Note that swapping out the current Convex client is not supported.
/**
 * Subscribe to a Convex query and return a reactive query result object.
 * Pass reactive args object or a closure returning args to update args reactively.
 *
 * Supports React-style `"skip"` to avoid subscribing:
 *   useQuery(api.users.get, () => (isAuthed ? {} : 'skip'))
 *
 * @param query - a FunctionReference like `api.dir1.dir2.filename.func`.
 * @param args - Arguments object / closure, or the string `"skip"` (or a closure returning it).
 * @param options - UseQueryOptions like `initialData` and `keepPreviousData`.
 * @returns an object containing data, isLoading, error, and isStale.
 */
export function useQuery<Query extends FunctionReference<'query'>>(
	query: Query,
	args: FunctionArgs<Query> | 'skip' | (() => FunctionArgs<Query> | 'skip') = {},
	options: UseQueryOptions<Query> | (() => UseQueryOptions<Query>) = {}
): UseQueryReturn<Query> {
	const client = useConvexClient();
	if (typeof query === 'string') {
		throw new Error('Query must be a functionReference object, not a string');
	}

	const state: {
		result: FunctionReturnType<Query> | Error | undefined;
		// The last result we actually received, if this query has ever received one.
		lastResult: FunctionReturnType<Query> | Error | undefined;
		// The args (query key) of the last result that was received.
		argsForLastResult: FunctionArgs<Query> | Skip | undefined;
		// If the args have never changed, fine to use initialData if provided.
		haveArgsEverChanged: boolean;
	} = $state({
		result: parseOptions(options).initialData,
		lastResult: undefined,
		argsForLastResult: undefined,
		haveArgsEverChanged: false
	});

	// When args change we need to unsubscribe to the old query and subscribe
	// to the new one.
	$effect(() => {
		const argsObject = parseArgs(args);

		// If skipped, don't create any subscription
		if (argsObject === SKIP) {
			// Clear transient result to mimic React: not loading, no data
			state.result = undefined;
			state.argsForLastResult = SKIP;
			return;
		}

		const unsubscribe = client.onUpdate(
			query,
			argsObject,
			(dataFromServer) => {
				const copy = structuredClone(dataFromServer);
				state.result = copy;
				state.argsForLastResult = argsObject;
				state.lastResult = copy;
			},
			(e: Error) => {
				state.result = e;
				state.argsForLastResult = argsObject;
				const copy = structuredClone(e);
				state.lastResult = copy;
			}
		);

		// Cleanup on args change/unmount
		return unsubscribe;
	});

	/*
	 ** staleness & args tracking **
	 * Are the args (the query key) the same as the last args we received a result for?
	 */
	const currentArgs = $derived(parseArgs(args));
	const initialArgs = parseArgs(args);

	const sameArgsAsLastResult = $derived(
		state.argsForLastResult !== undefined &&
			currentArgs !== SKIP &&
			state.argsForLastResult !== SKIP &&
			jsonEqualArgs(
				state.argsForLastResult as Record<string, Value>,
				currentArgs as Record<string, Value>
			)
	);

	const staleAllowed = $derived(!!(parseOptions(options).keepPreviousData && state.lastResult));
	const isSkipped = $derived(currentArgs === SKIP);

	// Once args change, move off of initialData.
	$effect(() => {
		if (!untrack(() => state.haveArgsEverChanged)) {
			const curr = parseArgs(args);
			if (!argsKeyEqual(initialArgs, curr)) {
				state.haveArgsEverChanged = true;
				const opts = parseOptions(options);
				if (opts.initialData !== undefined) {
					state.argsForLastResult = initialArgs === SKIP ? SKIP : $state.snapshot(initialArgs);
					state.lastResult = opts.initialData;
				}
			}
		}
	});

	/*
	 ** compute sync result **
	 * Return value or undefined; never an error object.
	 */
	const syncResult: FunctionReturnType<Query> | undefined = $derived.by(() => {
		if (isSkipped) return undefined;

		const opts = parseOptions(options);
		if (opts.initialData && !state.haveArgsEverChanged) {
			return state.result;
		}

		let value;
		try {
			value = client.disabled
				? undefined
				: client.client.localQueryResult(
						getFunctionName(query),
						currentArgs as Record<string, Value>
					);
		} catch (e) {
			if (!(e instanceof Error)) {
				console.error('threw non-Error instance', e);
				throw e;
			}
			value = e;
		}
		// Touch reactive state.result so updates retrigger computations
		state.result;
		return value;
	});

	const result = $derived.by(() => {
		return syncResult !== undefined ? syncResult : staleAllowed ? state.lastResult : undefined;
	});

	const isStale = $derived(
		!isSkipped &&
			syncResult === undefined &&
			staleAllowed &&
			!sameArgsAsLastResult &&
			result !== undefined
	);

	const data = $derived.by(() => {
		if (result instanceof Error) return undefined;
		return result;
	});

	const error = $derived.by(() => {
		if (result instanceof Error) return result;
		return undefined;
	});

	/*
	 ** public shape **
	 * This TypeScript cast promises data is not undefined if error and isLoading are checked first.
	 */
	return {
		get data() {
			return data;
		},
		get isLoading() {
			return isSkipped ? false : error === undefined && data === undefined;
		},
		get error() {
			return error;
		},
		get isStale() {
			return isSkipped ? false : isStale;
		}
	} as UseQueryReturn<Query>;
}

/**
 *  args can be an object, "skip", or a closure returning either 
 **/
function parseArgs(
	args: Record<string, Value> | 'skip' | (() => Record<string, Value> | 'skip')
): Record<string, Value> | Skip {
	if (typeof args === 'function') {
		args = args();
	}
	if (args === 'skip') return SKIP;
	return $state.snapshot(args);
}

// options can be an object or a closure
function parseOptions<Query extends FunctionReference<'query'>>(
	options: UseQueryOptions<Query> | (() => UseQueryOptions<Query>)
): UseQueryOptions<Query> {
	if (typeof options === 'function') {
		options = options();
	}
	return $state.snapshot(options);
}

function jsonEqualArgs(a: Record<string, Value>, b: Record<string, Value>): boolean {
	return JSON.stringify(convexToJson(a)) === JSON.stringify(convexToJson(b));
}

function argsKeyEqual(a: Record<string, Value> | Skip, b: Record<string, Value> | Skip): boolean {
	if (a === SKIP && b === SKIP) return true;
	if (a === SKIP || b === SKIP) return false;
	return jsonEqualArgs(a, b);
}
