<script lang="ts">
	import { useMutation, useQuery } from '$lib/index.js';
	import { api } from '../../../convex/_generated/api.js';

	const sendMessage = useMutation(api.messages.send);
	const deleteByAuthor = useMutation(api.messages.deleteByAuthor);

	const TEST_AUTHOR = '__e2e_use_mutation_test__';

	const messages = useQuery(api.messages.list, () => ({ muteWords: [] }));

	let sent = $state(false);
	let cleaned = $state(false);

	async function sendTestMessage() {
		await sendMessage({
			author: TEST_AUTHOR,
			body: 'Hello from useMutation e2e test'
		});
		sent = true;
	}

	async function cleanup() {
		await deleteByAuthor({ author: TEST_AUTHOR });
		cleaned = true;
	}

	const testMessage = $derived(messages.data?.find((m) => m.author === TEST_AUTHOR));
	const testMessageExists = $derived(!!testMessage);
</script>

<svelte:head>
	<title>useMutation / useAction Test</title>
</svelte:head>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">useMutation / useAction Test</h1>

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
	</div>

	<div class="space-y-1 text-sm text-gray-600">
		<p data-testid="sent">sent: {sent}</p>
		<p data-testid="cleaned">cleaned: {cleaned}</p>
		<p data-testid="test-message-exists">testMessageExists: {testMessageExists}</p>
		<p data-testid="test-message-body">testMessageBody: {testMessage?.body ?? ''}</p>
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
