<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';

	let { data } = $props();

	const messages = $derived(data.messages);
	const other = $derived(data.name === 'a' ? 'b' : 'a');
	const keepAliveParam = $derived(data.keepAlive ? '' : '?keepAlive=false');
	let hydrated = $derived(browser);
</script>

<svelte:head>
	<title>ConvexLoad Release Test</title>
</svelte:head>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">ConvexLoad Route Release Test</h1>

	<p class="text-sm text-gray-600">
		Queries created by <code>convexLoad</code> are released when the route no longer uses them.
	</p>

	<div class="space-y-1 text-sm text-gray-600">
		<p data-testid="hydrated">hydrated: {hydrated}</p>
		<p data-testid="page-name">page: {data.name}</p>
		<p data-testid="keep-alive">keepAlive: {data.keepAlive}</p>
	</div>

	<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
		{#if messages.isLoading}
			<p data-testid="loading" class="text-sm text-blue-600">Loading...</p>
		{:else}
			<p data-testid="data" class="text-sm text-green-700">
				Page {data.name}: loaded {messages.data?.length ?? 0} messages
			</p>
		{/if}
	</div>

	<a
		data-testid="nav-link"
		href="{resolve('/tests/convex-load-release/[name]', { name: other })}{keepAliveParam}"
		class="text-sm text-blue-600 underline">Go to page {other}</a
	>
</section>
