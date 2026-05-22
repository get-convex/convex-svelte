<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex, setupAuth } from '$lib/index.js';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);

	// Simulate an unauthenticated user — provider says not authenticated,
	// so setupAuth never calls setAuth and isAuthenticated settles to false.
	setupAuth(() => ({
		isLoading: false,
		isAuthenticated: false,
		fetchAccessToken: async () => null
	}));
</script>

{@render children()}
