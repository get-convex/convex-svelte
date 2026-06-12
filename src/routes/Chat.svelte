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
		const elapsed = Date.now() - ts;
		if (elapsed < 60_000) return 'just now';
		if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
		if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
		return new Date(ts).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const avatarStyles = [
		'bg-convex-red text-white',
		'bg-convex-yellow text-convex-ink',
		'bg-convex-purple text-white'
	] as const;

	function avatarStyle(name: string) {
		let hash = 0;
		for (const char of name) {
			hash = (hash * 31 + char.codePointAt(0)!) % avatarStyles.length;
		}
		return avatarStyles[hash];
	}
</script>

<div class="flex w-full flex-col">
	<div class="flex flex-col gap-3 border-b border-convex-ink/10 bg-convex-sand/40 px-5 py-4">
		<label class="relative block">
			<span class="sr-only" id="searchWordsLabel">Search messages containing:</span>
			<svg
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-convex-ink/40"
				viewBox="0 0 20 20"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				aria-hidden="true"
			>
				<circle cx="9" cy="9" r="6" />
				<path d="m17 17-3.5-3.5" />
			</svg>
			<input
				type="text"
				id="searchWords"
				name="searchWords"
				aria-labelledby="searchWordsLabel"
				placeholder="Search messages containing: vim, emacs"
				bind:value={searchWordsString}
				class="w-full rounded-full border border-convex-ink/15 bg-white py-2 pr-4 pl-9 text-sm shadow-sm transition-colors placeholder:text-convex-ink/40 focus:border-convex-purple focus:ring-2 focus:ring-convex-purple/20 focus:outline-none"
			/>
		</label>
		<div class="flex flex-wrap items-center gap-2">
			<label
				for="useStale"
				class="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors select-none {useStale
					? 'border-convex-purple/40 bg-convex-purple/10 text-convex-purple'
					: 'border-convex-ink/15 bg-white text-convex-ink/60 hover:border-convex-ink/30'}"
			>
				<input
					type="checkbox"
					id="useStale"
					name="useStale"
					bind:checked={useStale}
					class="h-3.5 w-3.5 cursor-pointer accent-convex-purple"
				/>
				Display old results while loading
			</label>
			<label
				for="skipQuery"
				class="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors select-none {skipQuery
					? 'border-convex-purple/40 bg-convex-purple/10 text-convex-purple'
					: 'border-convex-ink/15 bg-white text-convex-ink/60 hover:border-convex-ink/30'}"
			>
				<input
					type="checkbox"
					id="skipQuery"
					name="skipQuery"
					bind:checked={skipQuery}
					class="h-3.5 w-3.5 cursor-pointer accent-convex-purple"
				/>
				Skip query
			</label>
		</div>
	</div>

	<div class="flex min-h-64 flex-col px-5 py-4">
		{#if messages.isLoading && displayedMessages.length === 0}
			<div class="flex flex-1 flex-col items-center justify-center gap-2 py-8">
				<span
					class="h-5 w-5 animate-spin rounded-full border-2 border-convex-ink/20 border-t-convex-purple"
					aria-hidden="true"
				></span>
				<p class="text-sm text-convex-ink/50">Loading messages…</p>
			</div>
		{:else if messages.error}
			<div
				class="my-4 rounded-xl border border-convex-red/30 bg-convex-red/5 px-4 py-3 text-sm text-convex-red"
			>
				Failed to load: {messages.error}
			</div>
		{:else if displayedMessages.length === 0}
			<div class="flex flex-1 flex-col items-center justify-center gap-1 py-8 text-center">
				<p class="text-sm font-medium text-convex-ink/60">No messages yet</p>
				<p class="text-xs text-convex-ink/40">Send the first one below — it syncs in realtime.</p>
			</div>
		{:else}
			<ul class="flex flex-col gap-4">
				{#each displayedMessages as message (message._id)}
					<li data-testid="message-row" class="flex items-start gap-3">
						<span
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase {avatarStyle(
								message.author
							)}"
							aria-hidden="true"
						>
							{message.author.slice(0, 1) || '?'}
						</span>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<span class="max-w-40 truncate text-sm font-semibold">{message.author}</span>
								<span class="text-xs whitespace-nowrap text-convex-ink/40"
									>{formatDate(message._creationTime)}</span
								>
								<span
									data-testid="message-status"
									class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
										message.optimistic
											? 'animate-pulse bg-convex-yellow/20 text-amber-700'
											: 'bg-green-500/10 text-green-700'
									}`}
								>
									{message.optimistic ? 'Optimistic' : 'Server'}
								</span>
							</div>
							<p
								class="mt-1 inline-block max-w-full rounded-2xl rounded-tl-sm bg-convex-sand/70 px-3.5 py-2 text-sm wrap-break-word text-convex-ink/90"
							>
								{message.body}
							</p>
						</div>
					</li>
				{/each}
			</ul>
			<div class="mt-5 flex justify-center">
				<button
					onclick={() => messages.loadMore(3)}
					disabled={messages.status !== 'CanLoadMore'}
					class="rounded-full border border-convex-ink/15 bg-white px-4 py-1.5 text-xs font-medium text-convex-ink/70 shadow-sm transition-colors hover:border-convex-ink/30 hover:text-convex-ink enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
				>
					{messages.status === 'LoadingMore' ? 'Loading…' : 'Load more'}
				</button>
			</div>
		{/if}
	</div>

	<form
		onsubmit={onSubmit}
		class="flex items-start gap-2 border-t border-convex-ink/10 bg-convex-sand/40 px-5 py-4"
	>
		<input
			type="text"
			id="author"
			name="author"
			aria-label="Author"
			placeholder="Name"
			bind:value={author}
			class="w-24 rounded-full border border-convex-ink/15 bg-white px-3.5 py-2 text-sm shadow-sm transition-colors placeholder:text-convex-ink/40 focus:border-convex-purple focus:ring-2 focus:ring-convex-purple/20 focus:outline-none"
		/>
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			<input
				type="text"
				id="body"
				name="body"
				aria-label="Message"
				placeholder="Write a message…"
				maxlength={messageCharacterLimit}
				bind:value={toSend}
				class="w-full rounded-full border border-convex-ink/15 bg-white px-3.5 py-2 text-sm shadow-sm transition-colors placeholder:text-convex-ink/40 focus:border-convex-purple focus:ring-2 focus:ring-convex-purple/20 focus:outline-none"
			/>
			{#if toSend.length > 0}
				<span
					data-testid="message-character-count"
					class="self-end pr-2 text-xs {toSend.length >= messageCharacterLimit
						? 'font-medium text-convex-red'
						: 'text-convex-ink/40'}"
				>
					{toSend.length}/{messageCharacterLimit}
				</span>
			{/if}
		</div>
		<button
			type="submit"
			disabled={!toSend}
			data-testid="chat-send-button"
			class="inline-flex items-center gap-1.5 rounded-full bg-convex-red px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all enabled:cursor-pointer enabled:hover:-translate-y-px enabled:hover:bg-convex-red/90 disabled:cursor-not-allowed disabled:opacity-40"
		>
			Send
			<svg
				class="h-3.5 w-3.5"
				viewBox="0 0 20 20"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M3 10h11m-4-5 5 5-5 5" />
			</svg>
		</button>
	</form>
</div>
