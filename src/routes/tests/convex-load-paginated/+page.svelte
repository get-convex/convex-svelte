<script lang="ts">
	import { useConvexClient } from '$lib/index.js';
	import { browser } from '$app/environment';
	import { api } from '../../../convex/_generated/api.js';

	let { data } = $props();

	const client = useConvexClient();
	const messages = $derived(data.messages);

	const TEST_AUTHOR = '__e2e_convex_load_paginated_test__';
	let sent = $state(false);
	let cleaned = $state(false);
	let mutationError = $state('');
	let hydrated = $derived(browser);

	async function sendTestMessage() {
		try {
			await client.mutation(api.messages.send, {
				author: TEST_AUTHOR,
				body: 'Hello from convexLoadPaginated e2e test'
			});
			sent = true;
		} catch (e) {
			mutationError = String(e);
		}
	}

	async function cleanup() {
		try {
			await client.mutation(api.messages.deleteByAuthor, {
				author: TEST_AUTHOR
			});
			cleaned = true;
		} catch (e) {
			mutationError = String(e);
		}
	}

	const testMessageExists = $derived(
		messages.results?.some((m: { author: string }) => m.author === TEST_AUTHOR) ?? false
	);
</script>

<svelte:head>
	<title>ConvexLoadPaginated Test</title>
</svelte:head>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">ConvexLoadPaginated SSR Transport Test</h1>

	<div class="flex gap-2">
		<button
			data-testid="send-btn"
			onclick={sendTestMessage}
			class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>Send Message</button
		>
		<button
			data-testid="cleanup-btn"
			onclick={cleanup}
			class="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
			>Cleanup</button
		>
		<button
			data-testid="load-more-btn"
			onclick={() => messages.loadMore(3)}
			disabled={messages.status !== 'CanLoadMore'}
			class="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
		>
			Load More
		</button>
	</div>

	<div class="space-y-1 text-sm text-gray-600">
		<p data-testid="hydrated">hydrated: {hydrated}</p>
		<p data-testid="sent">sent: {sent}</p>
		<p data-testid="cleaned">cleaned: {cleaned}</p>
		<p data-testid="test-message-exists">testMessageExists: {testMessageExists}</p>
		<p data-testid="mutation-error">mutationError: {mutationError}</p>
		<p data-testid="status">status: {messages.status}</p>
	</div>

	<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
		{#if messages.isLoading}
			<p data-testid="loading" class="text-sm text-blue-600">Loading...</p>
		{:else if messages.error}
			<p data-testid="error" class="text-sm text-red-700">{messages.error.message}</p>
		{:else}
			<p data-testid="data" class="text-sm text-green-700">
				Loaded {messages.results?.length ?? 0} messages
			</p>
			<ul data-testid="results-list" class="mt-2 divide-y divide-gray-200">
				{#each messages.results as message, i (message._id)}
					<li data-testid="result-item-{i}" class="py-2 text-sm text-gray-700">
						<span data-testid="author-{i}" class="font-medium">{message.author}</span>:
						<span data-testid="body-{i}">{message.body}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>
