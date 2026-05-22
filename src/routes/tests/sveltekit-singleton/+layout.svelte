<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex, getConvexClient } from '$lib/index.js';
	import { initConvex } from '$lib/sveltekit/index.js';

	let { children } = $props();

	// Simulate hooks.client.ts early init
	const earlyClient = initConvex(PUBLIC_CONVEX_URL);

	// Now setupConvex should reuse the same client
	const layoutClient = setupConvex(PUBLIC_CONVEX_URL);

	// Also test getConvexClient() module-level access
	const moduleClient = getConvexClient();
</script>

<div data-testid="singleton-check" class="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
	<p data-testid="same-client" class="text-sm text-gray-600">
		sameClient: {earlyClient === layoutClient && layoutClient === moduleClient}
	</p>
</div>

{@render children()}
