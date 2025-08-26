import { useConvexClient } from "./client.svelte";
import { getFunctionName, type FunctionReference } from "convex/server";
import { convexToJson } from "convex/values";
import { tick } from "svelte";


export function generateCacheKey<Query extends FunctionReference<'query', 'public'>>(query: Query, args: Query['_args']) {
    return getFunctionName(query) + JSON.stringify(convexToJson(args));
}

export class ConvexQuery<Query extends FunctionReference<'query', 'public'>, T = Query['_returnType']> {
    _key: string;
    #init = false;
    #fn: () => Promise<T>;
    #loading = $state(true);
    #latest: Array<() => void> = [];
    unsubscribe: () => void;
    #args: Query['_args'];

    #ready = $state(false);
    #raw = $state.raw<T | undefined>(undefined);
    #promise: Promise<void>;
    #overrides = $state<Array<(old: T) => T>>([]);

    #current = $derived.by(() => {
        // don't reduce undefined value
        if (!this.#ready) return undefined;

        return this.#overrides.reduce((v, r) => r(v), this.#raw as T);
    });

    #error = $state.raw<Error | undefined>(undefined);

    #then = $derived.by(() => {
        const p = this.#promise;
        this.#overrides.length;

        return async (resolve?: (value: T) => void, reject?: (reason: any) => void) => {
            try {
                // svelte-ignore await_reactivity_loss
                await p;
                // svelte-ignore await_reactivity_loss
                await tick();
                resolve?.(this.#current as T);
                // resolve?.(untrack(() => this.#current as T));
                // resolve?.("this.#current as T");
            } catch (error) {
                reject?.(error);
            }
        };
    });

    constructor(query: Query, args: Query['_args']) {
        const client = useConvexClient();

        this._key = generateCacheKey(query, args);
        this.#args = args;
        this.#fn = () => client.query(query, this.#args);
        this.#promise = $state.raw(this.#run());

        this.unsubscribe = client.onUpdate(query, this.#args, (result: Query['_returnType']) => {
            // The first value is resolved by the promise, so we don't need to update the query here
            if (!this.#ready) return;

            this.#fn = () => Promise.resolve(result);
            this.#promise = this.#run();
        });
    }

    #run(): Promise<void> {
        // Prevent state_unsafe_mutation error on first run when the resource is created within the template
        if (this.#init) {
            this.#loading = true;
        } else {
            this.#init = true;
        }

        // Don't use Promise.withResolvers, it's too new still
        let resolve: () => void;
        let reject: (e?: any) => void;
        const promise: Promise<void> = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });

        this.#latest.push(resolve!);

        Promise.resolve(this.#fn())
            .then((value) => {
                // Skip the response if resource was refreshed with a later promise while we were waiting for this one to resolve
                const idx = this.#latest.indexOf(resolve!);
                if (idx === -1) return;

                this.#latest.splice(0, idx).forEach((r) => r());
                this.#ready = true;
                this.#loading = false;
                this.#raw = value;
                this.#error = undefined;

                resolve!();
            })
            .catch((e) => {
                const idx = this.#latest.indexOf(resolve!);
                if (idx === -1) return;

                this.#latest.splice(0, idx).forEach((r) => r());
                this.#error = e;
                this.#loading = false;
                reject!(e);
            });

        return promise;
    }

    get then() {
        return this.#then;
    }

    get catch() {
        this.#then;
        return (reject: (reason: any) => void) => {
            return this.#then(undefined, reject);
        };
    }

    get finally() {
        this.#then;
        return (fn: () => void) => {
            return this.#then(
                () => fn(),
                () => fn()
            );
        };
    }

    get current(): T | undefined {
        return this.#current;
    }

    get error(): Error | undefined {
        return this.#error;
    }

    /**
     * Returns true if the resource is loading or reloading.
     */
    get loading(): boolean {
        return this.#loading;
    }

    /**
     * Returns true once the resource has been loaded for the first time.
     */
    get ready(): boolean {
        return this.#ready;
    }

    set(value: T): void {
        this.#ready = true;
        this.#loading = false;
        this.#error = undefined;
        this.#raw = value;
        this.#promise = Promise.resolve();
    }

    withOverride(fn: (old: T) => T) {
        this.#overrides.push(fn);

        return {
            _key: this._key,
            release: () => {
                const i = this.#overrides.indexOf(fn);

                if (i !== -1) {
                    this.#overrides.splice(i, 1);
                }
            }
        };
    }
}


type CacheEntry = { count: number, resource: ConvexQuery<any> };
const queryCache = new Map<string, CacheEntry>();

function removeUnusedCachedValues(cacheKey: string, entry: CacheEntry) {
    void tick().then(() => {
        if (!entry.count && entry === queryCache.get(cacheKey)) {
            entry.resource.unsubscribe();
            queryCache.delete(cacheKey);
        }
    });
}

export const convexQuery = <Query extends FunctionReference<'query', 'public'>>(
    query: Query, args: Query['_args']
) => {
    const cacheKey = generateCacheKey(query, args);
    let entry = queryCache.get(cacheKey);

    let tracking = true;
    try {
        $effect.pre(() => {
            if (entry) entry.count++;
            return () => {
                const entry = queryCache.get(cacheKey);
                if (entry) {
                    entry.count--;
                    removeUnusedCachedValues(cacheKey, entry);
                }
            };
        });
    } catch {
        tracking = false;
    }

    let resource = entry?.resource;
    if (!resource) {
        resource = new ConvexQuery(query, args);
        queryCache.set(cacheKey,
            (entry = {
                count: tracking ? 1 : 0,
                resource,
            })
        );
        resource
            .then(() => {
                removeUnusedCachedValues(cacheKey, entry!);
            })
            .catch(() => {
                queryCache.delete(cacheKey);
            });
    }

    return resource as ConvexQuery<Query>;
};
