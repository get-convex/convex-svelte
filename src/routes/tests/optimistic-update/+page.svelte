<script lang="ts">
	import { useConvexClient, useQuery } from '$lib/index.js';
	import { api } from '../../../convex/_generated/api.js';

	const client = useConvexClient();
	const numbers = useQuery(api.numbers.get, {});

	let optimisticallyUpdated = $state(false);
	let resetDone = $state(false);

	async function updateOptimistic() {
		await client.mutation(
			api.numbers.update,
			{ a: 42, b: 0, c: 0 },
			{
				optimisticUpdate: (store) => {
					store.setQuery(api.numbers.get, {}, { a: 42, b: 0, c: 0 });
				}
			}
		);
		optimisticallyUpdated = true;
	}

	async function reset() {
		await client.mutation(api.numbers.update, { a: 0, b: 0, c: 0 });
		resetDone = true;
	}
</script>

<svelte:head>
	<title>Optimistic Update Test</title>
</svelte:head>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">Optimistic Update Test</h1>

	<div class="flex gap-2">
		<button
			data-testid="update-btn"
			onclick={updateOptimistic}
			class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>Update Optimistically</button
		>
		<button
			data-testid="reset-btn"
			onclick={reset}
			class="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
			>Reset</button
		>
	</div>

	<div class="space-y-1 text-sm text-gray-600">
		<p data-testid="optimistically-updated">optimisticallyUpdated: {optimisticallyUpdated}</p>
		<p data-testid="reset-done">resetDone: {resetDone}</p>
	</div>

	<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
		{#if numbers.isLoading}
			<p data-testid="loading" class="text-sm text-blue-600">Loading...</p>
		{:else if numbers.error}
			<p data-testid="error" class="text-sm text-red-700">{numbers.error.message}</p>
		{:else}
			<p data-testid="data" class="text-sm text-green-700">
				a={numbers.data.a} b={numbers.data.b} c={numbers.data.c}
			</p>
			<p data-testid="value-a" class="text-sm text-gray-600">valueA: {numbers.data.a}</p>
		{/if}
	</div>
</section>
