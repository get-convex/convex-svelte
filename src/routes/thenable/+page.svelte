<script lang="ts">
	import { convexQuery } from '$lib/async.svelte.js';
	import { useConvexClient } from '$lib/client.svelte.js';
	import { api } from '$convex/_generated/api.js';

	let muteWordsString = $state('');
	let muteWords = $derived(
		muteWordsString
			.split(',')
			.map((x) => x.trim())
			.filter((x) => x)
	);

	const messageForm = $state({
		body: '',
		author: 'me'
	});

	const messages = $derived(convexQuery(api.messages.list, { muteWords: muteWords }));

	const client = useConvexClient();

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		client.mutation(api.messages.send, messageForm).then(() => {
			messageForm.body = '';
		});
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleString();
	}
</script>

<div class="chat">
	<header class="header">
		<h2>Chat</h2>
		<span class="badge">Thenable Query</span>
	</header>

	<div class="toolbar">
		<div class="filters">
			<label for="muteWords">Hide messages with:</label>
			<input
				type="text"
				id="muteWords"
				name="muteWords"
				placeholder="e.g. vim, emacs"
				bind:value={muteWordsString}
			/>
		</div>
	</div>

	<div class="messagesWrap">
		<ul class="messages" aria-live="polite">
			{#each await messages as message (message._id)}
				<li class="message">
					<div class="avatar" aria-hidden="true">{message.author?.slice(0, 1).toUpperCase()}</div>
					<div class="bubble">
						<div class="meta">
							<span class="author">{message.author}</span>
							<span class="time">{formatDate(message._creationTime)}</span>
						</div>
						<div class="body">{message.body}</div>
					</div>
				</li>
			{/each}
		</ul>
	</div>

	<form class="composer" onsubmit={onSubmit}>
		<input
			type="text"
			id="author"
			name="author"
			bind:value={messageForm.author}
			placeholder="Your name"
		/>
		<input
			type="text"
			id="body"
			name="body"
			bind:value={messageForm.body}
			placeholder="Write a message…"
		/>
		<button type="submit" disabled={!messageForm.body.trim()}>Send</button>
	</form>
</div>

<style>
	.chat {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 860px;
		margin: 0 auto;
	}
	.header,
	.filters {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.header h2 {
		margin: 0;
	}
	.badge {
		font-size: 0.85rem;
		font-weight: 600;
		color: #0ea5e9;
		background: #e0f2fe;
		border: 1px solid #bae6fd;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
	}
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.messagesWrap {
		position: relative;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 10px;
		padding: 0.5rem;
		background: var(--color-bg-1, #fafafa);
		max-height: 60vh;
		overflow: auto;
	}
	.messages {
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.message {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}
	.avatar {
		inline-size: 40px;
		block-size: 40px;
		border-radius: 50%;
		background: #dbeafe;
		color: #1d4ed8;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
	}
	.bubble {
		background: #fff;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 12px;
		padding: 0.5rem 0.75rem;
		box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
		max-width: 72%;
	}
	.meta {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}
	.author {
		font-weight: 700;
	}
	.time {
		font-size: 0.8rem;
		color: #6b7280;
		white-space: nowrap;
	}
	.body {
		white-space: pre-wrap;
		word-wrap: break-word;
	}
	.composer {
		display: grid;
		grid-template-columns: 160px 1fr auto;
		gap: 0.5rem;
		align-items: center;
	}
	.composer input[type='text'] {
		appearance: none;
		border: 1px solid rgba(0, 0, 0, 0.18);
		border-radius: 10px;
		padding: 0.5rem 0.75rem;
		background: #fff;
	}
	.composer input[type='text']:focus {
		outline: 3px solid color-mix(in srgb, #0ea5e9 24%, transparent);
		border-color: #0ea5e9;
	}
	button {
		padding: 0.5rem 0.9rem;
		border-radius: 10px;
		border: 1px solid rgba(0, 0, 0, 0.12);
		background: linear-gradient(180deg, #fff, #f3f4f6);
		cursor: pointer;
		font-weight: 600;
	}
	button:hover {
		background: linear-gradient(180deg, #f8fafc, #e5e7eb);
	}
	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
