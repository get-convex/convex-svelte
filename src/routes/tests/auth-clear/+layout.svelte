<script lang="ts" module>
	// Module-level so child pages can import and toggle it
	let signedIn = $state(true);
	export function getSignedIn() {
		return signedIn;
	}
	export function setSignedIn(value: boolean) {
		signedIn = value;
	}
</script>

<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex, setupAuth } from '$lib/index.js';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);

	// Reactive auth provider: reads module-level signedIn state.
	// When signedIn toggles false, the $effect re-runs and calls clearAuth automatically.
	setupAuth(() => ({
		isLoading: false,
		isAuthenticated: signedIn,
		fetchAccessToken: async () => null
	}));
</script>

{@render children()}
