import { untrack } from 'svelte';
import {
    type FunctionReference,
    type FunctionArgs,
    type FunctionReturnType,
    getFunctionName
} from 'convex/server';
import { convexToJson, } from 'convex/values';
import { extract, type MaybeGetter } from 'runed';
import { useConvexClient } from './index.js';

export type UseQueryOptions<Query extends FunctionReference<'query'>> = {
    // Use this data and assume it is up to date (typically for SSR and hydration)
    initialData?: FunctionReturnType<Query>;
    // Instead of loading, render result from outdated args
    keepPreviousData?: boolean;
};

// Note that swapping out the current Convex client is not supported.
/**
 * Subscribe to a Convex query and return a reactive query result object.
 * Pass reactive args object or a closure returning args to update args reactively.
 *
 * @param query - a FunctionRefernece like `api.dir1.dir2.filename.func`.
 * @param args - The arguments to the query function.
 * @param options - UseQueryOptions like `initialData` and `keepPreviousData`.
 * @returns an object containing data, isLoading, error, and isStale.
 */
export function convexQuery<Query extends FunctionReference<'query'>>(
    query: Query,
    args: MaybeGetter<FunctionArgs<Query>>,
    options: MaybeGetter<UseQueryOptions<Query>> = {}
) {
    const client = useConvexClient();
    if (typeof query === 'string') {
        throw new Error('Query must be a functionReference object, not a string');
    }
    const state: {
        result: FunctionReturnType<Query> | Error | undefined;
        // The last result we actually received, if this query has ever received one.
        lastResult: FunctionReturnType<Query> | Error | undefined;
        // The args (query key) of the last result that was received.
        argsForLastResult: FunctionArgs<Query>;
        // If the args have never changed, fine to use initialData if provided.
        haveArgsEverChanged: boolean;
    } = $state({
        result: extractSnapshot(options).initialData,
        argsForLastResult: undefined,
        lastResult: undefined,
        haveArgsEverChanged: false
    });

    // When args change we need to unsubscribe to the old query and subscribe
    // to the new one.
    $effect(() => {
        const argsObject = extractSnapshot(args);
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
                // is it important to copy the error here?
                const copy = structuredClone(e);
                state.lastResult = copy;
            }
        );
        return unsubscribe;
    });

    // Are the args (the query key) the same as the last args we received a result for?
    const sameArgsAsLastResult = $derived(
        !!state.argsForLastResult &&
        JSON.stringify(convexToJson(state.argsForLastResult)) ===
        JSON.stringify(convexToJson(extractSnapshot(args)))
    );
    const staleAllowed = $derived(!!(extractSnapshot(options).keepPreviousData && state.lastResult));

    // Not reactive
    const initialArgs = extractSnapshot(args);
    // Once args change, move off of initialData.
    $effect(() => {
        if (!untrack(() => state.haveArgsEverChanged)) {
            if (
                JSON.stringify(convexToJson(extractSnapshot(args))) !== JSON.stringify(convexToJson(initialArgs))
            ) {
                state.haveArgsEverChanged = true;
                const opts = extractSnapshot(options);
                if (opts.initialData !== undefined) {
                    state.argsForLastResult = $state.snapshot(initialArgs);
                    state.lastResult = extractSnapshot(options).initialData;
                }
            }
        }
    });

    // Return value or undefined; never an error object.
    const syncResult: FunctionReturnType<Query> | undefined = $derived.by(() => {
        const opts = extractSnapshot(options);
        if (opts.initialData && !state.haveArgsEverChanged) {
            return state.result;
        }
        let value;
        try {
            value = client.disabled
                ? undefined
                : client.client.localQueryResult(getFunctionName(query), extractSnapshot(args));
        } catch (e) {
            if (!(e instanceof Error)) {
                // This should not happen by the API of localQueryResult().
                console.error('threw non-Error instance', e);
                throw e;
            }
            value = e;
        }
        // If state result has updated then it's time to check the for a new local value
        state.result;
        return value;
    });

    const result = $derived.by(() => {
        if (syncResult !== undefined) {
            return syncResult;
        }
        if (staleAllowed) {
            return state.lastResult;
        }
        return undefined;
    });
    const isStale = $derived(
        syncResult === undefined && staleAllowed && !sameArgsAsLastResult && result !== undefined
    );
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
    const isLoading = $derived(error === undefined && data === undefined);

    type PromiseResult = { get data(): NonNullable<FunctionReturnType<Query>> };
    let resolveProxyPromise: (value: PromiseResult) => void;
    let rejectProxyPromise: (value: Error) => void;
    const proxyPromise = new Promise<PromiseResult>((resolve, reject) => {
        resolveProxyPromise = resolve;
        rejectProxyPromise = reject;
    });

    $effect(() => {
        if (error) {
            rejectProxyPromise(error);
        } else if (data) {
            resolveProxyPromise({
                get data() {
                    return data
                }
            });
        }
    });

    // This TypeScript cast promises data is not undefined if error and isLoading are checked first.
    return {
        then: (
            onfulfilled: (value: PromiseResult) => void,
            onrejected: (reason: any) => void
        ) => {
            proxyPromise.then(onfulfilled, onrejected);
        },
    } as const;
}

function extractSnapshot<T>(value: MaybeGetter<T>) {
    return $state.snapshot(extract(value));
}