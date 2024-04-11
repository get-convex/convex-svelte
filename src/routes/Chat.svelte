<script lang="ts">
	import { useQuery, useConvexClient } from '$lib/client.svelte.js';
	import type { Doc } from '../convex/_generated/dataModel.js';
	import { api } from '../convex/_generated/api.js';

	const { initialMessages = [] as Doc<'messages'>[] } = $props();

	let messages = $state(initialMessages);
	let muteWordsString = $state('');
	let muteWords = $derived(
		muteWordsString
			.split(',')
			.map((x) => x.trim())
			.filter((x) => x)
	);
	let toSend = $state('');
	let author = $state('me');

	const query = useQuery(api.messages.list, () => ({ muteWords: muteWords }), {
		useResultFromPreviousArguments: true
	});

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

	<form on:submit|preventDefault={onSubmit}>
		<input type="text" id="author" name="author" bind:value={author} />
		<input type="text" id="body" name="body" bind:value={toSend} />
		<!-- TODO the submit button should be disabled if JavaScript is disabled
		or it should be wired up to a server-side endpoint that calls Convex. -->
		<button type="submit" disabled={!toSend}>Send</button>
	</form>
	{#if query.isLoading}
		Loading...
	{:else if query.error != null}
		failed to load
	{:else}
		<ul class="messages" class:stale={query.isStale}>
			<ul>
				{#each query.data as message}
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
		color: darkgray;
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
