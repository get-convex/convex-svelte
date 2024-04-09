<script lang="ts">
	import { ConvexClient } from 'convex/browser';
	import { setConvexClientContext } from './client.svelte.js';

	console.log('in ConvexProvider');

	// is this really the only way to type a prop?
	// how is children typed?
	let { children, url } = $props();
	if (!url || typeof url !== 'string') {
		throw new Error("Expected string url property for ConvexProvider")
	}

	// SvelteKit provides `import { browser } from $app/environment` but this is only
	// accurate in application code. So use a runtime conditional instead.
	// https://github.com/sveltejs/kit/issues/5879
	const isBrowser = typeof window !== 'undefined';

	// TODO consider making this state
	// Can a component in Svelte ever be remounted after being unmounted?
	let client = new ConvexClient(url, { disabled: !isBrowser })
	setConvexClientContext(client);


	$effect(() => {
		// TODO consider recreating the client on mount?
		return () => {
			client.close();
		};
	});
</script>

{@render (children as any)()}