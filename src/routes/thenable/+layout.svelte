<script lang="ts">
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();
</script>

<svelte:boundary>
    {@render children()}
    
    {#snippet pending()}
        <div>Loading...</div>
    {/snippet}
</svelte:boundary>