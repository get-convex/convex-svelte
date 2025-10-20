<script lang="ts">
	import { useQuery, useConvexClient } from '$lib/client.svelte.js';
	import type { Doc } from '../convex/_generated/dataModel.js';
	import { api } from '../convex/_generated/api.js';

	const { initialMessages = [] as Doc<'messages'>[] } = $props();

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

	const messages = $derived(
		useQuery(
			api.messages.list,
			() => (skipQuery ? 'skip' : { muteWords: muteWords }),
			() => ({ initialData: initialMessages, keepPreviousData: useStale })
		)
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

<div class="chat">
	<label for="muteWords"> Hide messages containing these phrases: </label>
	<input
		type="text"
		id="muteWords"
		name="muteWords"
		placeholder="vim, emacs"
		bind:value={muteWordsString}
	/>
	<div>
		<label for="useStale"> Display old results while loading: </label>
		<input type="checkbox" id="useStale" name="useStale" bind:checked={useStale} />
	</div>
	<div>
		<label for="skipQuery"> Skip query: </label>
		<input type="checkbox" id="skipQuery" name="skipQuery" bind:checked={skipQuery} />
	</div>
	<form onsubmit={onSubmit}>
		<input type="text" id="author" name="author" bind:value={author} />
		<input type="text" id="body" name="body" bind:value={toSend} />
		<button type="submit" disabled={!toSend}>Send</button>
	</form>

	{#if messages.isLoading}
		Loading...
	{:else if messages.error}
		failed to load {messages.error}
	{:else}
		<ul class="messages" class:stale={messages.isStale}>
			<ul>
				{#each messages.data as message}
					<li>
						<span>{message.author}</span>
						<span>{message.body}</span>
						<span>{formatDate(message._creationTime)}</span>
					</li>
				{/each}
			</ul>
		</ul>
	{/if}
</div>

<style>
	.chat {
		display: flex;
		align-items: center;
		flex-direction: column;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		margin: 1rem 0;
		width: 100%;
	}

	.stale {
		color: rgba(0, 0, 0, 0.8);
	}

	ul {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		padding: 0;
	}

	li {
		display: flex;
		width: 100%;
		gap: 1rem;
		justify-content: space-between;
		flex-wrap: wrap;
	}

	li span:nth-child(1) {
		flex: 0 0 100px;
		overflow-wrap: break-word;
		min-width: 0;
		font-weight: bold;
	}
	li span:nth-child(2) {
		flex: 1 0 160px;
		overflow-wrap: break-word;
		min-width: 0;
	}
	li span:nth-child(3) {
		flex: 0 0;
		white-space: nowrap;
	}

	button {
		padding: 0.3rem;
		margin: 0.2rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		background-color: transparent;
		touch-action: manipulation;
	}

	button:hover {
		background-color: var(--color-bg-1);
	}
	button:active {
		opacity: 0.6;
	}

	form {
		display: flex;
		align-items: center;
		max-width: 500px;
	}

	input#muteWords {
		width: 40%;
		max-width: 400px;
		min-width: 200px;
	}

	form input {
		margin: 4px;
	}
</style>
