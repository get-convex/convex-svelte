<script lang="ts">
	import { api } from '$convex/_generated/api.js';
	import { convexQuery } from '$lib/async.svelte.js';
	import { test } from './test.remote.js';

	let fail = $state(false);
	let skip = $state(false);

	const firstMessage = $derived(await convexQuery(api.messages.firstMessage, { fail }));

	const firstMessageQuery = $derived(convexQuery(api.messages.firstMessage, { fail }));
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
	<h1>Welcome to SvelteKit with Convex</h1>
	<a href="/tests">Tests</a>

	<!-- <button onclick={() => fail = !fail}>{fail ? 'Fail' : 'Success'}</button> -->
	<div>
		<label for="fail">should fail</label>
		<input id="fail" type="checkbox" bind:checked={fail} />
		<label for="skip">should skip</label>
		<input id="skip" type="checkbox" bind:checked={skip} />
	</div>
	<svelte:boundary>
		<pre>Result: {JSON.stringify(firstMessage, null, 2)}</pre>

		{#snippet pending()}
			<div>Loading...</div>
		{/snippet}

		{#snippet failed(error, retry)}
			<div>Error: {error}</div>
			<button onclick={retry}>Retry</button>
		{/snippet}
	</svelte:boundary>

	{#if firstMessageQuery.loading}
        <div>Loading...</div>
    {:else if firstMessageQuery.error}
        <div>Error: {firstMessageQuery.error}</div>
    {:else}
        <pre>Result: {JSON.stringify(firstMessageQuery.current, null, 2)}</pre>
    {/if}
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: 0.6;
	}

	h1 {
		width: 100%;
		text-align: center;
	}
</style>
