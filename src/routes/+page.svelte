<script lang="ts">
	import Chat from './Chat.svelte';
	import type { PageData } from './$types.js';
	// Is this really how to
	let { data = {} as unknown as PageData } = $props();
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
	<h1>Welcome to SvelteKit with Convex</h1>

	<Chat initialMessages={data.messages} />
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
	}
</style>
