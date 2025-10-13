<script lang="ts">
	import Inputs from '$lib/components/inputs.svelte';
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
	<h1>Modifying several inputs</h1>
	<p>Any user have complete control over these inputs but might change them quickly.</p>

	<Inputs />
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
