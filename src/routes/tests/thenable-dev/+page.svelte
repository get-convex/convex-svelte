<script lang="ts">
	import { api } from '$convex/_generated/api.js';
    import { convexQuery } from '$lib/convex-query.svelte.js';

    let fail = $state(false);

    const convexQueryResult = $derived(convexQuery(api.messages.firstMessage, { fail }));
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
	<h1>Welcome to SvelteKit with Convex</h1>
    <a href="/tests">Tests</a>

    <svelte:boundary>
        <pre>Result: {JSON.stringify(await convexQueryResult, null, 2)}</pre>
        <pre>Result: {JSON.stringify(await convexQuery(api.messages.firstMessage, { fail }), null, 2)}</pre>
        {#snippet pending()}
            <div>Loading...</div>
        {/snippet}
        {#snippet failed(error, retry)}
            <div>Error: {error}</div>
            <button onclick={retry}>Retry</button>
        {/snippet}
    </svelte:boundary>

    {#if convexQueryResult.loading}
        <div>Loading...</div>
    {:else if convexQueryResult.error}
        <div>Error: {convexQueryResult.error}</div>
    {:else}
        <pre>Result: {JSON.stringify(convexQueryResult.current, null, 2)}</pre>
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
