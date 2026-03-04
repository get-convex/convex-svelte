import { useConvexClient } from "./client.svelte.js"
import { getFunctionName, type FunctionReference } from "convex/server"
import { convexToJson } from "convex/values"
import { cacheResource, type Cache } from "./cache.svelte.js"
import { browser } from "$app/environment"
import { hydratable, tick } from "svelte";
import { getContext, setContext } from "svelte";

const errorKey = Symbol("convex-query-error-Key")

class ConvexQuery<
    Query extends FunctionReference<'query', 'public'>,
    QueryResult = Query['_returnType'],
> {
    unsubscribe: (() => void) | undefined = undefined;
    #args: Query['_args']

    #promise: Promise<QueryResult>
    #key: string

    /* A Convex Query can never return undefined, so it's our initial value */
    #current: Query['_returnType'] | undefined = $state.raw(undefined)
    #error: unknown | undefined = $state.raw(undefined)
    #isLoading: boolean = $state.raw(true)

    constructor(
        { query, args, key }: {
            query: Query,
            args: Query['_args'],
            key: string,
        }
    ) {
        const client = useConvexClient()

        this.#key = key
        this.#args = args

        this.#promise = $state.raw(client.query(query, this.#args))

        if (browser) {
            this.unsubscribe = client.onUpdate(
                query,
                this.#args,
                (result: Query['_returnType']) => {
                    // The first value is resolved by the promise, so we don't need to update the query here
                    if (this.#current === undefined) return

                    this.#promise = Promise.resolve(result)
                },
                async (error) => {
                    this.#promise = Promise.reject(error)
                }
            )
        }
    }

    get then() {
        const promise = this.#promise
        const hydratedPromise = hydratable(this.#key, () => 
            promise.catch((error) => ({ [errorKey]: error }))
        );

        return async <T>(resolve?: (value: QueryResult) => T, reject?: (reason: any) => unknown) => {
            const value = await hydratedPromise;
            await tick();
            if (
                typeof value === "object"
                && value !== null
                && errorKey in value
            ) {
                this.#current = undefined
                this.#error = value[errorKey]
                this.#isLoading = false
                return reject?.(value[errorKey])
            }

            this.#current = value
            this.#error = undefined
            this.#isLoading = false
            return resolve?.(value)
        }
    }

    get current() {
        return this.#current
    }

    get isLoading() {
        return this.#isLoading
    }

    get error() {
        return this.#error
    }
}

function generateCacheKey<
    Query extends FunctionReference<'query', 'public'>
>(
    query: Query,
    args: Query['_args'],
) {
    try {
        convexToJson(args)
    } catch (error) {
        const argsTypes = Object.fromEntries(
            Object.entries(args).map(([key, value]) => [key, typeof value]),
        )
        throw new Error(`Invalid arguments for query ${getFunctionName(query)}: ${JSON.stringify(argsTypes)}`)
    }
    return `${getFunctionName(query)}-${JSON.stringify(args)}`
}

export function convexQuery<
    Query extends FunctionReference<'query', 'public'>,
>(
    query: Query,
    args: Query['_args'],
) {
    const { env, ...rest } = args
    const cacheKey = generateCacheKey(query, rest)
    const createQuery = () => new ConvexQuery({ query, args, key: cacheKey })

    const cache = getConvexQueryCache()
    return cacheResource(
        cache,
        cacheKey,
        () => {
            if (import.meta.env.DEV) {
                console.debug("creating new ConvexQuery " + getFunctionName(query))
            }
            return createQuery()
        },
        {
            unsubscribe: (entry) => {
                if (import.meta.env.DEV) {
                    console.debug("unsubscribing from ConvexQuery " + getFunctionName(query))
                }
                entry.resource.unsubscribe?.()
            },
        },
    )
};


function createContext<T>(key: symbol | string) {
    function getCustomContext() {
        return getContext<T>(key);
    }

    function setCustomContext(intialData: T) {
        const state = $state(intialData);
        setContext(key, state);
        return state;
    }

    return [
        getCustomContext,
        setCustomContext,
    ] as const
}

const CONVEX_QUERY_CACHE_CTX = "CONVEX_QUERY_CACHE_CTX"
export const [getConvexQueryCache, setConvexQueryCache] = createContext<Cache<ConvexQuery<any, any>>>(CONVEX_QUERY_CACHE_CTX)
