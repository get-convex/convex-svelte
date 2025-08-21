import { useConvexClient } from "$lib/client.svelte.js";
import { getFunctionName, type FunctionReference } from "convex/server";

export type ConvexQuery<T> = {
    then: (
        onfulfilled: (value: T) => void,
        onrejected: (reason: any) => void
    ) => void;
    current: T | undefined;
    error: Error | undefined;
    loading: boolean;
}


export type ConvexQueryOptions<Query extends FunctionReference<'query'>> = {
    // Use this data and assume it is up to date (typically for SSR and hydration)
    initialData?: Query['_returnType'];
    // Prevent the query from updating when false
    skip?: boolean;
};

/**
 * Subscribe to a Convex query and return a reactive query result object that can be awaited.
*
 * @experimental API is experimental and could change.
 * @param queryFunc - a FunctionRefernece like `api.dir1.dir2.filename.func`.
 * @param args - The arguments to the query function.
 * @param options - ConvexQueryOptions like `initialData`.
 * @returns a thenable object.  Also contains `current`, `error`, and `loading` properties.
 */
export function convexQuery<
    Query extends FunctionReference<'query', 'public'>,
    Args extends Query['_args']
>(
    queryFunc: Query,
    args: Args,
    options: ConvexQueryOptions<Query> = {}
): ConvexQuery<Query['_returnType']> {
    const client = useConvexClient();

    const state: {
        current: Query['_returnType'] | undefined,
        error: Error | undefined,
    } = $state({
        /* Get the current value from the cache */
        current: client.client.localQueryResult(
            getFunctionName(queryFunc), args
        ) ?? options.initialData,
        error: undefined,
    });

    const loading: boolean = $derived(
        state.current === undefined && state.error === undefined
    );

    /* Subscription lifecycle for the query.  Subscription is removed when options.skip is true */
    $effect(() => {
        let unsubscribe = () => { };
        if (!options.skip) {
            unsubscribe = client.onUpdate(
                queryFunc,
                args,
                (result) => {
                    state.current = result;
                    state.error = undefined;
                },
                (err) => {
                    state.current = undefined;
                    state.error = err;
                }
            );
        }

        return unsubscribe;
    });

    return {
        get then() {
            const value = state.current;
            try {
                return (
                    resolve: (value: Query['_returnType']) => void,
                    reject: (reason: any) => void,
                ) => {
                    /* If there is initial data then resolve immediately */
                    if (value !== undefined) {
                        resolve(value);
                        return;
                    }

                    /* If the query is already in the cache, return the cached value */
                    client.query(queryFunc, args).then((result) => {
                        resolve(value ?? result);
                    }).catch((err) => {
                        reject(err);
                        throw err;
                    });
                }
            } catch (err) {
                state.error = err as Error;
                return (
                    resolve: (value: Query['_returnType']) => void,
                    reject: (reason: any) => void,
                ) => {
                    reject(err);
                }
            }
        },
        get current() { return state.current; },
        get error() { return state.error; },
        get loading() { return loading; },
    };
}