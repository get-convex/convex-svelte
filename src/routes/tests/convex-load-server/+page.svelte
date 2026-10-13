<script lang="ts">
	import { browser } from '$app/environment';

	let { data } = $props();
	const messages = $derived(data.messages);
	let hydrated = $derived(browser);
</script>

<svelte:head>
	<title>ConvexLoad Server Load Test</title>
</svelte:head>

<p data-testid="hydrated">hydrated: {hydrated}</p>
{#if messages.isLoading}
	<p data-testid="loading">Loading...</p>
{:else}
	<p data-testid="data">loaded {messages.data?.length ?? 0} messages</p>
{/if}
