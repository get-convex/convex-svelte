<script lang="ts">
	import { useQuery, useConvexClient } from '$lib/client.svelte.js';
	import type { Doc } from '../../../convex/_generated/dataModel.js';
	import { api } from '../../../convex/_generated/api.js';

	const foo = useQuery(api.messages.error, {});

	function fail(msg: any) {
		setTimeout(() => {
			throw new Error(msg);
		}, 0);
		return msg;
	}
</script>

<section>
	<h1>This query always errors</h1>

	{#if foo.data}
		<p>query has data.</p>
	{/if}
	{#if foo.error}
		<p>query errored.</p>
	{/if}
	{#if foo.isLoading}
		<p>query is loading.</p>
	{/if}
	{#if foo.error && foo.isLoading}
		<p>{fail('query errored and is loading. (impossible state unless useStale were true)')}</p>
	{/if}
	{#if foo.data && foo.isLoading}
		<p>{fail('query has data and is loading. (impossible state unless useStale were true)')}</p>
	{/if}
	{#if foo.data && foo.error}
		<p>query errored and has data. (impossible state)</p>
	{/if}
	{#if !foo.isLoading && !foo.error && !foo.data}
		<p>{fail('query is not loading and did not error and has no data. (impossible state)')}</p>
	{/if}
	{#if foo.isLoading && foo.error && foo.data}
		<p>{fail('query is loading and has error and has data. (impossible state)')}</p>
	{/if}

	{#if foo.error}<p>error message:</p>
		<code><pre> {foo.error.message} </pre></code>
	{/if}
</section>
