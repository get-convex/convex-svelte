<script lang="ts">
  import { useQuery } from '$lib/client.svelte.js';
  import { api } from '../../../convex/_generated/api.js';
  
  let skipQuery = $state(false);
  
  const messages = useQuery(
    api.messages.list,
    () => (skipQuery ? 'skip' : { muteWords: [] })
  );
</script>

<section>
  <h1>Skip Query Test</h1>
  
  <label>
    <input type="checkbox" bind:checked={skipQuery} data-testid="skip-checkbox" />
    Skip Query
  </label>
  
  <div data-testid="query-state">
    {#if messages.isLoading}
      <p data-testid="loading">Loading</p>
    {:else if messages.error}
      <p data-testid="error">Error: {messages.error.message}</p>
    {:else if messages.data}
      <p data-testid="data">Data: {messages.data.length} messages</p>
    {:else}
      <p data-testid="no-data">No data</p>
    {/if}
  </div>
</section>