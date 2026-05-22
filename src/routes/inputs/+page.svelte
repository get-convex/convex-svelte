<script lang="ts">
	import Inputs from './Inputs.svelte';
</script>

<svelte:head>
	<title>Inputs</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-2 text-3xl font-bold text-gray-900">Modifying Several Inputs</h1>
	<p class="mb-8 text-gray-600">
		Any user has complete control over these inputs but might change them quickly.
	</p>

	<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
		<Inputs />
	</div>
</div>
