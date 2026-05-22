<script lang="ts">
	import { useQuery } from '$lib/client.svelte.js';
	import { api } from '../../../convex/_generated/api.js';

	const foo = useQuery(api.messages.error, {});

	// Extract individual properties so the discriminated union doesn't narrow
	// cross-property checks to `never`. This test page intentionally validates
	// that impossible runtime states never occur.
	const fooData = $derived(foo.data);
	const fooError = $derived(foo.error);
	const fooIsLoading = $derived(foo.isLoading);

	function fail(msg: string) {
		setTimeout(() => {
			throw new Error(msg);
		}, 0);
		return msg;
	}
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">This query always errors</h1>

	{#if fooData}
		<p class="text-sm text-green-700">query has data.</p>
	{/if}
	{#if fooError}
		<p class="text-sm text-red-700">query errored.</p>
	{/if}
	{#if fooIsLoading}
		<p class="text-sm text-blue-700">query is loading.</p>
	{/if}
	{#if fooError && fooIsLoading}
		<p class="text-sm text-red-700">
			{fail('query errored and is loading. (impossible state unless useStale were true)')}
		</p>
	{/if}
	{#if fooData && fooIsLoading}
		<p class="text-sm text-red-700">
			{fail('query has data and is loading. (impossible state unless useStale were true)')}
		</p>
	{/if}
	{#if fooData && fooError}
		<p class="text-sm text-red-700">query errored and has data. (impossible state)</p>
	{/if}
	{#if !fooIsLoading && !fooError && !fooData}
		<p class="text-sm text-red-700">
			{fail('query is not loading and did not error and has no data. (impossible state)')}
		</p>
	{/if}
	{#if fooIsLoading && fooError && fooData}
		<p class="text-sm text-red-700">
			{fail('query is loading and has error and has data. (impossible state)')}
		</p>
	{/if}

	{#if fooError}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="mb-2 text-sm font-medium text-red-800">error message:</p>
			<code class="block overflow-x-auto rounded bg-red-100 p-2 font-mono text-xs text-red-900"
				><pre>{fooError.message}</pre></code
			>
		</div>
	{/if}
</section>
