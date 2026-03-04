import { tick } from "svelte";

export type CacheEntry<T> = { count: number, resource: T };
export type Cache<T> = Map<string, CacheEntry<T>>;

export function removeUnusedCachedValues<T>(
    cache: Cache<T>,
    cacheKey: string,
    entry: CacheEntry<T>,
    unsubscribe?: (entry: CacheEntry<T>) => void,
) {
    void tick().then(() => {
        if (entry.count === 0 && entry === cache.get(cacheKey)) {
            unsubscribe?.(entry);
            cache.delete(cacheKey);
        }
    });
}

export function cacheResource<T, R extends T>(
    cache: Cache<R>,
    cacheKey: string,
    resource: () => T,
    options: {
        unsubscribe?: (entry: CacheEntry<T>) => void,
        shouldRecompute?: (cachedEntry: CacheEntry<T>) => boolean,
    } = {},
): T {
    let entry = cache.get(cacheKey);

    let tracking = true;
    try {
        $effect.pre(() => {
            if (entry) entry.count++;
            return () => {
                const entry = cache.get(cacheKey);
                if (entry) {
                    entry.count--;
                    removeUnusedCachedValues(cache, cacheKey, entry, options.unsubscribe);
                }
            };
        });
    } catch {
        tracking = false;
        console.warn("Tracking failed for Convex Query")
    }

    let resourceObject = entry?.resource as T | undefined;
    if ((resourceObject === undefined) || (entry && options.shouldRecompute?.(entry))) {
        resourceObject = resource()
        entry = {
            count: tracking ? 1 : 0,
            resource: resourceObject as R,
        }
        cache.set(cacheKey, entry);

        if (typeof (resourceObject as any)?.then === "function") {
            (resourceObject as any)
                .then(() => {
                    removeUnusedCachedValues(cache, cacheKey, entry!, options.unsubscribe);
                })
                .catch(() => {
                    cache.delete(cacheKey);
                });
        } else {
            removeUnusedCachedValues(cache, cacheKey, entry!, options.unsubscribe);
        }
    }

    return resourceObject
}