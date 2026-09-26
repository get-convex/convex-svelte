<script lang="ts">
	let { data, children } = $props();
	const layoutMessages = $derived(data.layoutMessages);
</script>

{#if !layoutMessages.isLoading}
	<p data-testid="layout-data">layout: {layoutMessages.data?.length ?? 0} messages</p>
{/if}
{@render children()}
