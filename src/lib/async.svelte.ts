import { useConvexClient } from "$lib/client.svelte.js";
import { type FunctionReference } from "convex/server";

type ConvexQuery<T> = {
    then: (
        onfulfilled: (value: T) => void,
        onrejected: (reason: any) => void
    ) => void;
    current: T | undefined;
    error: Error | undefined;
    loading: boolean;
    [Symbol.dispose]: () => void;
}

export function convexQuery<
    Query extends FunctionReference<'query', 'public'>,
>(
    queryFunc: Query,
    args: Query['_args'] = {}
): ConvexQuery<Query['_returnType']> {
    const client = useConvexClient();

    const state: {
        current: Query['_returnType'] | undefined,
        error: Error | undefined,
    } = $state({
        current: undefined,
        error: undefined,
    });

    const loading: boolean = $derived(
        state.current === undefined && state.error === undefined
    );

	/* Get the value from Convex and subscribe to it */
    const unsubscribe = client.onUpdate(
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

    /* Unsubscribe from the query when the parent component is destroyed */
    $effect(() => unsubscribe);

    return {
        get then() {
            const value = state.current;
            try {
                return (
                    resolve: (value: Query['_returnType']) => void,
                    reject: (reason: any) => void,
                ) => {
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
        [Symbol.dispose]: unsubscribe
    };
}