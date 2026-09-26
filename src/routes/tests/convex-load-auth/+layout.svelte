<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex, setupAuth } from '$lib/index.js';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);

	// Simulates an app whose SSR confirmed the user is signed in. The token is
	// fake (the test backend has no auth provider), but the client still sends
	// it, so the e2e test can check when queries go out relative to auth.
	setupAuth(
		() => ({
			isLoading: false,
			isAuthenticated: true,
			fetchAccessToken: async () => 'e2e-fake-token'
		}),
		{ initialState: { isAuthenticated: true } }
	);
</script>

{@render children()}
