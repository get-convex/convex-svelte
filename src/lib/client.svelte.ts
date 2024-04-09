import { getContext, setContext, unstate } from 'svelte';
import type { ConvexClient } from 'convex/browser';
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server';
import { convexToJson, type Value } from 'convex/values';

const _contextKey = '$$_convexClient';

export const getConvexClientContext = (): ConvexClient => {
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

export function useConvexClient(): ConvexClient {
	const queryClient = getConvexClientContext();
	return queryClient;
}

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
/**
 * Note: only reactive with respect to arguments.
 *
 * Args can be a reactive object or a function that returns an object.
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
	const client = getConvexClientContext();
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
		// console.log('args must have changed!', argsObject.muteWords);
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
			//console.log('got response from server:', dataFromServer);
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

	return returnValue as UseQueryReturn<Query>;
}

/**
 * Validate that the arguments to a Convex function are an object, defaulting
 * `undefined` to `{}`.
 */
export function parseArgs(
	args: Record<string, Value> | (() => Record<string, Value>)
): Record<string, Value> {
	if (typeof args === 'function') {
		args = args();
	}
	args = unstate(args);
	if (!isSimpleObject(args)) {
		throw new Error(`The arguments to a Convex function must be an object. Received: ${args}`);
	}
	return args;
}

/**
 * Check whether a value is a plain old JavaScript object.
 */
export function isSimpleObject(value: unknown) {
	const isObject = typeof value === 'object';
	const prototype = Object.getPrototypeOf(value);
	const isSimple =
		prototype === null ||
		prototype === Object.prototype ||
		// Objects generated from other contexts (e.g. across Node.js `vm` modules) will not satisfy the previous
		// conditions but are still simple objects.
		prototype?.constructor?.name === 'Object';
	return isObject && isSimple;
}
