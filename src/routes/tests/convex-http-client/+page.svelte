<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>ConvexHttpClient Test</title>
</svelte:head>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">createConvexHttpClient Test</h1>
	<p class="text-sm text-gray-600">
		Tests server-side data fetching using createConvexHttpClient in +page.server.ts
	</p>

	<p data-testid="data" class="text-sm text-green-700">
		Loaded {data.messageCount} messages from server
	</p>

	{#if data.messages.length > 0}
		<p data-testid="first-message" class="text-sm text-gray-700">{data.messages[0].body}</p>
	{/if}
</section>
