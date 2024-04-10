import { getContext, setContext, unstate } from 'svelte';
import type { ConvexClient } from 'convex/browser';
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server';
import { convexToJson, type Value } from 'convex/values';

const _contextKey = '$$_convexClient';

export const useConvexClient = (): ConvexClient => {
	const client = getContext(_contextKey) as ConvexClient | undefined;
	if (!client) {
		throw new Error(
			'No ConvexClient was found in Svelte context. Did you forget to wrap your component with ConvexClientProvider?'
		);
	}
	return client;
};

export const setConvexClientContext = (client: ConvexClient): void => {
	setContext(_contextKey, client);
};

type UseQueryOptions = {
	useResultFromPreviousArguments?: boolean;
};

type UseQueryReturn<Query extends FunctionReference<'query'>> =
	| { data: undefined; error: undefined; isLoading: true; isStale: false }
	| { data: undefined; error: Error; isLoading: false; isStale: boolean }
	| { data: FunctionReturnType<Query>; error: undefined; isLoading: false; isStale: boolean };

// Note that swapping out the current Convex client is not supported either.
/**
 * Subscribe to a Convex query and return a reactive query object.
 * Pass in a reactive args object or closure returning to update args reactively.
 *
 * @param query - a FunctionRefernece like `api.dir1.dir2.filename.func`.
 * @param args - The arguments to the query function.
 * @returns an object containing data, isLoading, error, and isStale.
 */
export function useQuery<Query extends FunctionReference<'query'>>(
	query: Query,
	args: FunctionArgs<Query> | (() => FunctionArgs<Query>),
	options: UseQueryOptions = {}
): UseQueryReturn<Query> {
	const client = useConvexClient();
	if (typeof query === 'string') {
		throw new Error('Query must be a functionReference object, not a string');
	}

	// TODO make reactive to changes in options? We basically get this for free
	// but should probably accept a closure.

	// TODO some structural sharing here would be sweet!
	// The Svelte version of this is diffing the responses and generating
	// mutations on a reactive object. Is this a good idea?

	const state: {
		result: FunctionReturnType<Query> | Error | undefined;
		argsForLastResult: FunctionArgs<Query>;
		lastResult: FunctionReturnType<Query> | Error | undefined;
	} = $state({
		result: undefined,
		argsForLastResult: undefined,
		lastResult: undefined
	});

	// When args change, unsubscribe and resubscribe.
	$effect(() => {
		const argsObject = parseArgs(args);
		state.result = undefined;

		const unsubscribe = client.onUpdate(query, argsObject, (dataFromServer) => {
			// TODO is this helpful? (saving the original from being made reactive)
			// (note we're potentially copying error objects here)
			const copy = structuredClone(dataFromServer);

			// TODO can/should each property be frozen?
			state.result = copy;
			state.argsForLastResult = argsObject;
			state.lastResult = copy;
		});
		return unsubscribe;
	});

	const sameArgs = $derived(
		!!state.argsForLastResult &&
			JSON.stringify(convexToJson(state.argsForLastResult)) ===
				JSON.stringify(convexToJson(parseArgs(args)))
	);
	const useStale = $derived(!!(options.useResultFromPreviousArguments && state.lastResult));
	const result = $derived(useStale ? state.lastResult : state.result);
	const isStale = $derived(useStale && !sameArgs);
	const data = $derived.by(() => {
		if (result instanceof Error) {
			return undefined;
		}
		return result;
	});
	const error = $derived.by(() => {
		if (result instanceof Error) {
			return result;
		}
		return undefined;
	});

	// Cast to promise we're limiting ourselves to sensible values.
	return {
		get data() {
			return data;
		},
		get isLoading() {
			return data === undefined;
		},
		get error() {
			return error;
		},
		get isStale() {
			return isStale;
		}
	} as UseQueryReturn<Query>;
}

// args can be an object or a closure returning one
function parseArgs(
	args: Record<string, Value> | (() => Record<string, Value>)
): Record<string, Value> {
	if (typeof args === 'function') {
		args = args();
	}
	return unstate(args);
}
