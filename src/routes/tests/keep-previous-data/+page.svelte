<script lang="ts">
	import { useQuery } from '$lib/index.js';
	import { api } from '../../../convex/_generated/api.js';

	let muteWords = $state<string[]>([]);

	const messages = useQuery(api.messages.list, () => ({ muteWords }), { keepPreviousData: true });

	let initialCount = $state<number | null>(null);

	$effect(() => {
		if (messages.data && initialCount === null) {
			initialCount = messages.data.length;
		}
	});
</script>

<svelte:head>
	<title>Keep Previous Data Test</title>
</svelte:head>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">Keep Previous Data Test</h1>

	<div class="flex gap-2">
		<button
			data-testid="change-args"
			onclick={() => (muteWords = ['__nonexistent_mute_word_xyz__'])}
			class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
		>
			Change Args
		</button>
		<button
			data-testid="reset-args"
			onclick={() => (muteWords = [])}
			class="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
			>Reset Args</button
		>
	</div>

	<div class="space-y-1 text-sm text-gray-600">
		<p data-testid="is-stale">isStale: {messages.isStale}</p>
		<p data-testid="is-loading">isLoading: {messages.isLoading}</p>
		<p data-testid="initial-count">initialCount: {initialCount}</p>
	</div>

	<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
		{#if messages.isLoading}
			<p data-testid="loading" class="text-sm text-blue-600">Loading...</p>
		{:else if messages.error}
			<p data-testid="error" class="text-sm text-red-700">{messages.error.message}</p>
		{:else}
			<p data-testid="data" class="text-sm text-green-700">
				Loaded {messages.data.length} messages
			</p>
		{/if}
	</div>
</section>
