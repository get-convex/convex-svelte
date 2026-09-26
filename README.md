[Convex](https://www.convex.dev/) is the typesafe backend-as-a-service with realtime updates, server functions, crons and scheduled jobs, file storage, vector search, and more.

[Quickstart](https://docs.convex.dev/quickstart/svelte)

# convex-svelte

Receive live updates to Convex query subscriptions and call mutations and actions from Svelte with `convex-svelte`.

## Documentation

Full documentation lives at **[docs.convex.dev/client/svelte/overview](https://docs.convex.dev/client/svelte/overview)**:

- **[Reactivity](https://docs.convex.dev/client/svelte/reactivity)** — queries, mutations & actions, client access, and paginated queries.
- **[SvelteKit Server Rendering](https://docs.convex.dev/client/svelte/sveltekit-server-rendering)** — SSR with `convexLoad` / `convexLoadPaginated`, the `initialData` alternative, server helpers, and deploying.
- **[Authentication](https://docs.convex.dev/client/svelte/authentication)** — wiring an auth provider with `setupAuth` / `useAuth`.
- **[Troubleshooting](https://docs.convex.dev/client/svelte/troubleshooting)** — common issues and fixes.

## Installation

```bash
npm install convex convex-svelte
```

Svelte doesn't like referencing code outside of `src/`, so customize the Convex functions directory by creating a `convex.json` in your project root:

```json
{
	"functions": "src/convex/"
}
```

Then set up a Convex dev deployment:

```bash
npx convex dev
```

## Usage

Call `setupConvex()` once in your root layout, then subscribe to queries with `useQuery()` in any component:

```svelte
<!-- +layout.svelte -->
<script lang="ts">
	import { setupConvex } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';

	setupConvex(PUBLIC_CONVEX_URL);
</script>
```

```svelte
<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../convex/_generated/api.js';

	const messages = useQuery(api.messages.list, {});
</script>

{#if messages.isLoading}
	Loading...
{:else if messages.error}
	Failed to load: {messages.error.toString()}
{:else}
	{#each messages.data as message}
		<p>{message.author}: {message.body}</p>
	{/each}
{/if}
```

See the [Quickstart](https://docs.convex.dev/quickstart/svelte) and the [full documentation](https://docs.convex.dev/client/svelte/overview) for more.
