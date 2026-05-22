<script lang="ts">
	import { useQuery, type UseQueryReturn } from '$lib/client.svelte.js';
	import { api } from '../../../convex/_generated/api.js';

	let skipQuery = $state(false);

	const messages: UseQueryReturn<typeof api.messages.list> = useQuery(api.messages.list, () =>
		skipQuery ? 'skip' : { muteWords: [] }
	);
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">Skip Query Test</h1>

	<label class="inline-flex items-center gap-2 text-sm text-gray-700">
		<input
			type="checkbox"
			bind:checked={skipQuery}
			data-testid="skip-checkbox"
			class="rounded border-gray-300"
		/>
		Skip Query
	</label>

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
