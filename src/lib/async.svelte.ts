import { useConvexClient } from "./client.svelte";
import { getFunctionName, type FunctionReference } from "convex/server";
import { convexToJson } from "convex/values";
import { tick } from "svelte";


export type ConvexQueryOptions<Query extends FunctionReference<'query', 'public'>> = {
	// Use this data and assume it is up to date (typically for SSR and hydration)
	initialData?: Query['_returnType'];
};

export function generateCacheKey<
	Query extends FunctionReference<'query', 'public'>
>(
	query: Query,
	args: Query['_args']
) {
	return getFunctionName(query)
		+ JSON.stringify(convexToJson(args))
}

export class ConvexQuery<
	Query extends FunctionReference<'query', 'public'>,
	T = Query['_returnType'],
> {
	_key: string;
	#init = false;
	#fn: () => Promise<T>;
	#loading = $state(true);
	unsubscribe: () => void;
	#args: Query['_args'];

	#ready = $state(false);
	#raw = $state.raw<T | undefined>(undefined);
	#promise: Promise<T>;

	#error = $state.raw<Error | undefined>(undefined);

	#then = $derived.by(() => {
		const p = this.#promise;

		return async (resolve?: (value: T) => void, reject?: (reason: any) => void) => {
			try {
				// svelte-ignore await_reactivity_loss
				const value = await p;
				// svelte-ignore await_reactivity_loss
				await tick();
				resolve?.(value as T);
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

			this.set(result);
		}, (error) => {
			this.#fn = () => Promise.reject(error);
			this.#promise = this.#run();
		});
	}

	#run(): Promise<T> {
		// Prevent state_unsafe_mutation error on first run when the resource is created within the template
		if (this.#init) {
			this.#loading = true;
		} else {
			this.#init = true;
		}

		// Don't use Promise.withResolvers, it's too new still
		let resolve: (value: T) => void;
		let reject: (e?: any) => void;
		const promise: Promise<T> = new Promise<T>((res, rej) => {
			resolve = res as any;
			reject = rej;
		});

		Promise.resolve(this.#fn())
			.then((value) => {
				this.#ready = true;
				this.#loading = false;
				this.#raw = value;
				this.#error = undefined;

				resolve!(value);
			})
			.catch((e) => {
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
		return this.#raw;
	}

	get data(): T | undefined {
		return this.#raw;
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
		this.#promise = Promise.resolve(value);
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
	query: Query,
	args: Query['_args']
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
