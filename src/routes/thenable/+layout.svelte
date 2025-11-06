<script lang="ts">
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>
<svelte:boundary onerror={(e) => {
	console.error(e)
}}>
	{@render children()}

	{#snippet pending()}
		<div>Loading...</div>
	{/snippet}
	{#snippet failed(error, reset)}
		<p>Error: {error}</p>
		<button onclick={reset}>oops! try again</button>
	{/snippet}
</svelte:boundary>