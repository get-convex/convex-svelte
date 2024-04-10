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

// TODO should this thing be a class? that's how state is expressed in the normal world, outside the wackiness of React hooks.
// Update the arguments somehow?
// Changes to query and options will not be noticed.
// Swapping out the ConvexClient used is not supported either.
/**
 * Subscribe to a Convex query and return a reactive query object.
 * Pass in a reactive args object or closure returning to update args reactively.
 *
 * @param query
 * @param args
 * @param options
 * @returns
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

	// TODO some structural sharing here would be sweet!
	// The Svelte version of this is diffing the responses and generating
	// mutations on a reactive object. Is this a good idea?

	const state: {
		data: FunctionReturnType<Query> | Error | undefined;
		argsForLastResult: FunctionArgs<Query>;
		lastResult: FunctionReturnType<Query> | Error | undefined;
	} = $state({
		data: undefined,
		argsForLastResult: undefined,
		lastResult: undefined
	});

	// Do these transitions need to be batched?
	// Since these properties can't be set atomically, cheat the types here.
	// Be careful not let these lies spread!
	const returnValue: {
		data: FunctionReturnType<Query> | undefined;
		error: Error | undefined;
		isLoading: boolean;
		isStale: boolean;
	} = $state({
		data: undefined,
		error: undefined,
		isLoading: true,
		isStale: false
	});

	// When args change, unsubscribe and resubscribe.
	$effect(() => {
		const argsObject = parseArgs(args);
		state.data = undefined;

		// Transition to new query
		if (options.useResultFromPreviousArguments && state.lastResult) {
			// The result is only stale if the arguments differ
			const sameArgs =
				JSON.stringify(convexToJson(state.argsForLastResult)) ===
				JSON.stringify(convexToJson(parseArgs(args)));
			if (state.lastResult instanceof Error) {
				returnValue.error = state.lastResult;
				returnValue.data = undefined;
			} else {
				returnValue.data = state.lastResult;
				returnValue.error = undefined;
			}
			returnValue.isStale = !sameArgs;
			returnValue.isLoading = false;
		} else {
			returnValue.isLoading = true;
			returnValue.data = undefined;
			returnValue.error = undefined;
			returnValue.isStale = false;
		}

		const unsubscribe = client.onUpdate(query, argsObject, (dataFromServer) => {
			const copy = structuredClone(dataFromServer);

			// TODO can/should each property be frozen?
			state.data = copy;
			state.argsForLastResult = argsObject;
			state.lastResult = copy;

			if ((dataFromServer as unknown) instanceof Error) {
				returnValue.error = copy;
				returnValue.isStale = false;
				returnValue.isLoading = false;
				returnValue.data = undefined;
			} else {
				returnValue.data = copy;
				returnValue.error = undefined;
				returnValue.isStale = false;
				returnValue.isLoading = false;
			}
		});
		return unsubscribe;
	});

	// Cast to promise we're limiting ourselves to sensible values.
	return returnValue as UseQueryReturn<Query>;
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
