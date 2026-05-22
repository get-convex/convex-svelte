<script lang="ts">
	import { useQuery } from '$lib/index.js';
	import { api } from '../../../convex/_generated/api.js';

	const messages = useQuery(api.messages.list, { muteWords: [] });
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">SvelteKit Singleton Test</h1>

	<div data-testid="query-state" class="rounded-lg border border-gray-200 bg-gray-50 p-4">
		{#if messages.isLoading}
			<p data-testid="loading" class="text-sm text-blue-600">Loading</p>
		{:else if messages.error}
			<p data-testid="error" class="text-sm text-red-700">Error: {messages.error.message}</p>
		{:else if messages.data}
			<p data-testid="data" class="text-sm text-green-700">Data: {messages.data.length} messages</p>
		{:else}
			<p data-testid="no-data" class="text-sm text-gray-500">No data</p>
		{/if}
	</div>
</section>
