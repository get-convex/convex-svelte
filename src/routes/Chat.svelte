<script lang="ts">
	import { usePaginatedQuery, useConvexClient } from '$lib/index.js';
	import { api } from '../convex/_generated/api.js';
	import type { FunctionReturnType } from 'convex/server';

	const {
		initialMessages
	}: { initialMessages: FunctionReturnType<typeof api.messages.paginatedList> } = $props();

	let useStale = $state(true);
	let muteWordsString = $state('');
	let muteWords = $derived(
		muteWordsString
			.split(',')
			.map((x) => x.trim())
			.filter((x) => x)
	);
	let toSend = $state('');
	let author = $state('me');

	let skipQuery = $state(false);

	const messages = usePaginatedQuery(
		api.messages.paginatedList,
		() => (skipQuery ? 'skip' : { muteWords: muteWords }),
		() => ({
			initialNumItems: 3,
			initialData: initialMessages,
			keepPreviousData: useStale
		})
	);

	const client = useConvexClient();

	function onSubmit(e: SubmitEvent) {
		const data = Object.fromEntries(new FormData(e.target as HTMLFormElement).entries());
		toSend = '';
		client.mutation(api.messages.send, {
			author: data.author as string,
			body: data.body as string
		});
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleString();
	}
</script>

<div class="flex w-full flex-col items-center gap-4">
	<div class="flex w-full flex-col gap-3">
		<div class="flex items-center gap-2">
			<label for="muteWords" class="text-sm font-medium text-gray-700"
				>Hide messages containing:</label
			>
			<input
				type="text"
				id="muteWords"
				name="muteWords"
				placeholder="vim, emacs"
				bind:value={muteWordsString}
				class="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
			/>
		</div>
		<div class="flex items-center gap-2">
			<input
				type="checkbox"
				id="useStale"
				name="useStale"
				bind:checked={useStale}
				class="rounded border-gray-300 text-blue-600"
			/>
			<label for="useStale" class="text-sm text-gray-700">Display old results while loading</label>
		</div>
		<div class="flex items-center gap-2">
			<input
				type="checkbox"
				id="skipQuery"
				name="skipQuery"
				bind:checked={skipQuery}
				class="rounded border-gray-300 text-blue-600"
			/>
			<label for="skipQuery" class="text-sm text-gray-700">Skip query</label>
		</div>
	</div>

	<form onsubmit={onSubmit} class="flex w-full max-w-lg items-center gap-2">
		<input
			type="text"
			id="author"
			name="author"
			bind:value={author}
			class="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
		/>
		<input
			type="text"
			id="body"
			name="body"
			bind:value={toSend}
			class="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
		/>
		<button
			type="submit"
			disabled={!toSend}
			class="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
			>Send</button
		>
	</form>

	{#if messages.isLoading}
		<p class="py-4 text-sm text-gray-500">Loading...</p>
	{:else if messages.error}
		<p class="py-4 text-sm text-red-600">Failed to load: {messages.error}</p>
	{:else}
		<ul class="w-full divide-y divide-gray-100">
			{#each messages.results as message (message._id)}
				<li class="flex items-baseline gap-4 py-2">
					<span class="w-24 shrink-0 break-words text-sm font-semibold text-gray-900"
						>{message.author}</span
					>
					<span class="min-w-0 flex-1 break-words text-sm text-gray-700">{message.body}</span>
					<span class="shrink-0 text-xs whitespace-nowrap text-gray-400"
						>{formatDate(message._creationTime)}</span
					>
				</li>
			{/each}
		</ul>
		<button
			onclick={() => messages.loadMore(3)}
			disabled={messages.status !== 'CanLoadMore'}
			class="rounded-md border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
		>
			Load more
		</button>
	{/if}
</div>
