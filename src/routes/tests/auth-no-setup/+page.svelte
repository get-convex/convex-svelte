<script lang="ts">
	import { useAuth } from '$lib/index.js';

	let errorMessage = $state('');

	try {
		useAuth();
	} catch (e) {
		errorMessage = e instanceof Error ? e.message : String(e);
	}
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">Auth No Setup Test</h1>

	{#if errorMessage}
		<p data-testid="error" class="text-sm text-red-700">{errorMessage}</p>
	{:else}
		<p data-testid="no-error" class="text-sm text-green-700">No error thrown</p>
	{/if}
</section>
