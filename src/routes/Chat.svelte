<script lang="ts">
	import { usePaginatedQuery, useConvexClient } from '$lib/index.js';
	import { api } from '../convex/_generated/api.js';
	import type { FunctionReturnType } from 'convex/server';

	const {
		initialMessages
	}: { initialMessages: FunctionReturnType<typeof api.messages.paginatedList> } = $props();

	type ServerMessage = FunctionReturnType<typeof api.messages.paginatedList>['page'][number];
	type Message = ServerMessage & { optimistic?: true };

	let useStale = $state(true);
	let searchWordsString = $state('');
	let searchWords = $derived(
		searchWordsString
			.split(',')
			.map((x) => x.trim())
			.filter((x) => x)
	);
	let toSend = $state('');
	let author = $state('me');

	let skipQuery = $state(false);

	const messages = usePaginatedQuery(
		api.messages.paginatedList,
		() => (skipQuery ? 'skip' : { searchWords }),
		() => ({
			initialNumItems: 3,
			initialData: initialMessages,
			keepPreviousData: useStale
		})
	);
	let displayedMessages = $derived(messages.results as Message[]);

	const client = useConvexClient();
	const messageCharacterLimit = 140;

	function sameStrings(left: string[], right: string[]) {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const submittedAuthor = author;
		const submittedBody = toSend;
		if (!submittedBody) return;

		const submittedSearchWords = [...searchWords];
		const optimisticId = `optimistic:${crypto.randomUUID()}` as ServerMessage['_id'];
		const optimisticCreatedAt = Date.now();
		toSend = '';
		void client.mutation(
			api.messages.send,
			{
				author: submittedAuthor,
				body: submittedBody
			},
			{
				optimisticUpdate: (store) => {
					if (
						submittedSearchWords.length > 0 &&
						!submittedSearchWords.some((word) =>
							submittedBody.toLowerCase().includes(word.toLowerCase())
						)
					) {
						return;
					}

					const firstPage = store
						.getAllQueries(api.messages.paginatedList)
						.find(
							(query) =>
								query.value != null &&
								query.args.paginationOpts.cursor === null &&
								sameStrings(query.args.searchWords, submittedSearchWords)
						);

					if (!firstPage?.value) return;

					const optimisticMessage: Message = {
						_id: optimisticId,
						_creationTime: optimisticCreatedAt,
						author: submittedAuthor,
						body: submittedBody,
						optimistic: true
					};

					if (firstPage.value.page.some((message) => message._id === optimisticId)) {
						return;
					}

					store.setQuery(api.messages.paginatedList, firstPage.args, {
						...firstPage.value,
						page: [optimisticMessage, ...firstPage.value.page]
					});
				}
			}
		);
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleString();
	}
</script>

<div class="flex w-full flex-col items-center gap-4">
	<div class="flex w-full flex-col gap-3">
		<div class="flex items-center gap-2">
			<label for="searchWords" class="text-sm font-medium text-gray-700"
				>Search messages containing:</label
			>
			<input
				type="text"
				id="searchWords"
				name="searchWords"
				placeholder="vim, emacs"
				bind:value={searchWordsString}
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

	<form onsubmit={onSubmit} class="flex w-full max-w-lg items-start gap-2">
		<input
			type="text"
			id="author"
			name="author"
			aria-label="Author"
			bind:value={author}
			class="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
		/>
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			<input
				type="text"
				id="body"
				name="body"
				aria-label="Message"
				maxlength={messageCharacterLimit}
				bind:value={toSend}
				class="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
			/>
			{#if toSend.length > 0}
				<span data-testid="message-character-count" class="self-end text-xs text-gray-500">
					{toSend.length}/{messageCharacterLimit}
				</span>
			{/if}
		</div>
		<button
			type="submit"
			disabled={!toSend}
			data-testid="chat-send-button"
			class="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
			>Send</button
		>
	</form>

	{#if messages.isLoading && displayedMessages.length === 0}
		<p class="py-4 text-sm text-gray-500">Loading...</p>
	{:else if messages.error}
		<p class="py-4 text-sm text-red-600">Failed to load: {messages.error}</p>
	{:else}
		<ul class="w-full divide-y divide-gray-100">
			{#each displayedMessages as message (message._id)}
				<li data-testid="message-row" class="flex items-baseline gap-4 py-2">
					<span class="w-24 shrink-0 wrap-break-word text-sm font-semibold text-gray-900"
						>{message.author}</span
					>
					<span class="min-w-0 flex-1 wrap-break-word text-sm text-gray-700">{message.body}</span>
					<span
						data-testid="message-status"
						class={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
							message.optimistic ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
						}`}
					>
						{message.optimistic ? 'Optimistic' : 'Server'}
					</span>
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
