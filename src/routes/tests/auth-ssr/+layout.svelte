<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex, setupAuth } from '$lib/index.js';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);

	// Provider says not authenticated (simulating client-side auth not yet loaded),
	// but SSR initialState says authenticated. The SSR seed is trusted initially,
	// then the provider state takes over once the $effect runs.
	setupAuth(
		() => ({
			isLoading: false,
			isAuthenticated: false,
			fetchAccessToken: async () => null
		}),
		{ initialState: { isAuthenticated: true } }
	);
</script>

{@render children()}
