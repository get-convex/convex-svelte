<script lang="ts">
	import { browser } from '$app/environment';

	let { data } = $props();
	const pageMessages = $derived(data.pageMessages);
	let hydrated = $derived(browser);
</script>

<svelte:head>
	<title>ConvexLoad Nested Loads Test</title>
</svelte:head>

<p data-testid="hydrated">hydrated: {hydrated}</p>
{#if pageMessages.isLoading}
	<p data-testid="loading">Loading...</p>
{:else}
	<p data-testid="data">page: {pageMessages.data?.length ?? 0} messages</p>
{/if}
