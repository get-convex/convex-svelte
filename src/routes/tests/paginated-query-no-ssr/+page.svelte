<script lang="ts">
	import { usePaginatedQuery } from '$lib/use_paginated_query.svelte.js';
	import { api } from '../../../convex/_generated/api.js';

	let skipQuery = $state(false);

	const messages = usePaginatedQuery(
		api.messages.paginatedList,
		() => (skipQuery ? 'skip' : { muteWords: [] }),
		{
			initialNumItems: 3
		}
	);
</script>

<section class="space-y-4 p-4">
	<h1 class="text-2xl font-bold text-gray-900">Paginated Query Test (No SSR)</h1>

	<div class="flex gap-4">
		<label class="inline-flex items-center gap-2 text-sm text-gray-700">
			<input
				type="checkbox"
				bind:checked={skipQuery}
				data-testid="skip-checkbox"
				class="rounded border-gray-300"
			/>
			Skip Query
		</label>
	</div>

	<div data-testid="query-state" class="rounded-lg border border-gray-200 bg-gray-50 p-4">
		{#if messages.isLoading}
			<p data-testid="loading" class="text-sm text-blue-600">Loading</p>
		{:else if messages.error}
			<p data-testid="error" class="text-sm text-red-700">Error: {messages.error.message}</p>
		{:else if messages.results && messages.results.length > 0}
			<p data-testid="data" class="text-sm text-green-700">
				Results: {messages.results.length} messages
			</p>
		{:else}
			<p data-testid="no-data" class="text-sm text-gray-500">No data</p>
		{/if}
	</div>

	<div data-testid="status-container">
		<p data-testid="status" class="text-sm text-gray-600">Status: {messages.status}</p>
	</div>

	<div data-testid="results-container">
		{#if messages.results}
			<ul data-testid="results-list" class="divide-y divide-gray-200">
				{#each messages.results as message, i (message._id)}
					<li data-testid="result-item-{i}" class="py-2 text-sm text-gray-700">
						<span data-testid="author-{i}" class="font-medium">{message.author}</span>:
						<span data-testid="body-{i}">{message.body}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="mt-4 space-y-2">
		<button
			data-testid="load-more-btn"
			onclick={() => messages.loadMore(3)}
			disabled={messages.status !== 'CanLoadMore'}
			class="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
		>
			Load More
		</button>

		<p data-testid="can-load-more" class="text-sm text-gray-600">
			Can Load More: {messages.status === 'CanLoadMore' ? 'yes' : 'no'}
		</p>

		<p data-testid="is-exhausted" class="text-sm text-gray-600">
			Is Exhausted: {messages.status === 'Exhausted' ? 'yes' : 'no'}
		</p>
	</div>
</section>
