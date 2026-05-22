[Convex](https://www.convex.dev/) is the typesafe backend-as-a-service with realtime updates, server functions, crons and scheduled jobs, file storage, vector search, and more.

[Quickstart](https://docs.convex.dev/quickstart/svelte)

# convex-svelte

Receive live updates to Convex query subscriptions and call mutations and actions from Svelte with `convex-svelte`.

## Table of Contents

- [Svelte (Core)](#svelte-core)
  - [Installation](#installation)
  - [Setup](#setup)
  - [Queries](#queries)
  - [Mutations & Actions](#mutations--actions)
  - [Client Access](#client-access)
  - [Paginated Queries](#paginated-queries)
  - [Authentication](#authentication)
- [SvelteKit](#sveltekit)
  - [SSR with convexLoad / convexLoadPaginated (recommended)](#ssr-with-convexload--convexloadpaginated-recommended)
  - [SSR with initialData (manual alternative)](#ssr-with-initialdata-manual-alternative)
  - [Server Helpers](#server-helpers)
- [Deploying](#deploying)
- [Troubleshooting](#troubleshooting)
- [Why SSR with Convex?](#why-ssr-with-convex)
- [API Reference](#api-reference)

## Svelte (Core)

Everything in this section works in **any Svelte app** — SvelteKit, Vite + Svelte, or any other setup.

### Installation

Install the Convex client and server library:

```bash
npm install convex convex-svelte
```

Svelte doesn't like referencing code outside of `src/`, so customize the Convex functions directory. Create a `convex.json` in your project root:

```json
{
	"functions": "src/convex/"
}
```

Set up a Convex dev deployment:

```bash
npx convex dev
```

This will prompt you to log in, create a project, and save your deployment URLs. It also creates a `src/convex/` folder for your backend API functions.

### Setup

Call `setupConvex()` once in a root layout component (e.g. `+layout.svelte`). This initializes a [`ConvexClient`](https://docs.convex.dev/api/classes/browser.ConvexClient), stores it in Svelte context so child components can access it, and automatically closes the connection when the component is destroyed.

```svelte
<!-- +layout.svelte -->
<script lang="ts">
	import { setupConvex } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';

	const client = setupConvex(PUBLIC_CONVEX_URL);
</script>
```

`setupConvex()` returns the `ConvexClient` instance, which you can use directly in the layout for mutations or actions (e.g. an auth nav bar). In child components and `.ts` files, use `getConvexClient()` to retrieve it — see [Client Access](#client-access).

You can pass [`ConvexClientOptions`](https://docs.convex.dev/api/interfaces/browser.ConvexClientOptions) as the second argument to configure the client.

> **Non-SvelteKit usage**: If you're using plain Vite + Svelte (no SvelteKit), replace `$env/static/public` with `import.meta.env.VITE_CONVEX_URL` and set `VITE_CONVEX_URL` in your `.env` file.

### Queries

Use `useQuery()` to subscribe to a Convex query with automatic real-time updates. When the data changes on the server, your component re-renders automatically.

```svelte
<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api.js';

	const messages = useQuery(api.messages.list, () => ({ muteWords }), {
		keepPreviousData: true
	});
</script>

{#if messages.isLoading}
	Loading...
{:else if messages.error != null}
	failed to load: {messages.error.toString()}
{:else}
	<ul>
		{#each messages.data as message}
			<li>
				<span>{message.author}</span>
				<span>{message.body}</span>
			</li>
		{/each}
	</ul>
{/if}
```

The returned object is reactive and has the following shape:

| Property    | Type                 | Description                                                |
| ----------- | -------------------- | ---------------------------------------------------------- |
| `data`      | `T \| undefined`     | The query result, or `undefined` while loading             |
| `error`     | `Error \| undefined` | The error, if the query failed                             |
| `isLoading` | `boolean`            | `true` until the first result or error is received         |
| `isStale`   | `boolean`            | `true` when displaying cached data from previous arguments |

#### Options

- **`initialData`** — pre-loaded data for SSR/hydration, avoids the loading state (see [SSR with initialData](#ssr-with-initialdata-manual-alternative))
- **`keepPreviousData`** — when `true`, keeps displaying the previous result while new data loads after args change

#### Skipping queries

You can conditionally skip a query by returning `'skip'` from the arguments function. This is useful when a query depends on some condition, like authentication state or user input.

```svelte
<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../convex/_generated/api.js';

	let auth = $state({ isAuthenticated: true });

	const user = useQuery(api.users.queries.getActiveUser, () =>
		auth.isAuthenticated ? {} : 'skip'
	);
</script>

{#if user.isLoading}
	Loading user...
{:else if user.error}
	Error: {user.error}
{:else if user.data}
	Welcome, {user.data.name}!
{/if}
```

When a query is skipped, `isLoading` will be `false`, `error` will be `null`, and `data` will be `undefined`.

### Mutations & Actions

Use `useMutation()` and `useAction()` to get callable functions for your Convex mutations and actions. Both use the module-level singleton (`getConvexClient()`) internally, so they work in `.svelte` components **and** plain `.ts` / `.js` files — anywhere after `setupConvex()` has been called.

```svelte
<script lang="ts">
	import { useMutation } from 'convex-svelte';
	import { api } from '../../convex/_generated/api.js';

	const sendMessage = useMutation(api.messages.send);

	let toSend = $state('');
	let author = $state('me');

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		const data = Object.fromEntries(new FormData(event.target as HTMLFormElement).entries());
		sendMessage({
			author: data.author as string,
			body: data.body as string
		});
	}
</script>

<form onsubmit={handleSubmit}>
	<input type="text" name="author" bind:value={author} />
	<input type="text" name="body" bind:value={toSend} />
	<button type="submit" disabled={!toSend}>Send</button>
</form>
```

Actions are similar to mutations but can have side effects like calling third-party APIs:

```ts
import { useAction } from 'convex-svelte';
import { api } from '../../convex/_generated/api.js';

const generateUploadUrl = useAction(api.files.generateUploadUrl);
const uploadUrl = await generateUploadUrl({});
```

#### Optimistic updates

Optimistic updates let you update the UI immediately when a mutation is called, without waiting for the server to respond. Pass an `optimisticUpdate` callback in the mutation options at the call site to update the local query cache.

```svelte
<script lang="ts">
	import { useMutation } from 'convex-svelte';
	import { api } from '../../convex/_generated/api.js';

	const updateUser = useMutation(api.user.update);

	async function handleUpdate() {
		await updateUser(
			{ name: 'John Doe' },
			{
				optimisticUpdate: (store) => {
					store.setQuery(api.user.get, {}, { name: 'John Doe' });
				}
			}
		);
	}
</script>
```

Inside the `optimisticUpdate` callback, use `store.setQuery()` to update the local cache for a specific query. The arguments are:

1. **Query reference** — the query to update (e.g. `api.user.get`)
2. **Query arguments** — must match the arguments used by the active `useQuery()` subscription
3. **New value** — the optimistic data to display immediately

If the mutation fails, the optimistic update is automatically rolled back and the UI reverts to the server state.

### Client Access

#### `getConvexClient()` — universal client access

`getConvexClient()` retrieves the client from a **module-level singleton**. It works anywhere — `.svelte` components, plain `.ts` utility files, service layers, async callbacks — as long as `setupConvex()` has been called first.

This is the recommended way to access the client outside of the layout where `setupConvex()` returns it directly.

#### `useConvexClient()` — Svelte context alternative

`useConvexClient()` retrieves the same client from **Svelte context** via `getContext()`. It only works during component initialization — inside `.svelte` files or code called synchronously from a component's `<script>` block. Both functions return the same `ConvexClient` instance.

|               | `getConvexClient()`                | `useConvexClient()`    |
| ------------- | ---------------------------------- | ---------------------- |
| **Works in**  | Anywhere (`.ts`, `.svelte`, hooks) | Svelte components only |
| **Mechanism** | Module singleton                   | Svelte `getContext()`  |

#### Using mutations in utility files

`useMutation()` and `useAction()` work in plain `.ts` files too, since they use the module-level singleton:

```ts
// src/lib/services/tasks.ts
import { useMutation } from 'convex-svelte';
import { api } from '../convex/_generated/api.js';

const createTaskMutation = useMutation(api.tasks.create);
const completeTaskMutation = useMutation(api.tasks.complete);

export async function createTask(text: string) {
	await createTaskMutation({ text });
}

export async function completeTask(id: string) {
	await completeTaskMutation({ id });
}
```

Then call these functions from any component without plumbing the client through:

```svelte
<script lang="ts">
	import { createTask } from '$lib/services/tasks.js';

	let text = $state('');
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		createTask(text);
		text = '';
	}}
>
	<input bind:value={text} />
	<button type="submit">Add</button>
</form>
```

For advanced use cases like one-time queries, use `getConvexClient()` directly:

```ts
import { getConvexClient } from 'convex-svelte';
import { api } from '../convex/_generated/api.js';

// One-time query (no WebSocket subscription, just a single fetch)
export async function getTaskCount() {
	const client = getConvexClient();
	return await client.query(api.tasks.count, {});
}
```

> **Note**: The `.svelte.ts` file extension enables Svelte 5 runes (`$state`, `$derived`, `$effect`) but does **not** make `getContext()` work outside components. If you need the client in a plain `.ts` file, use `getConvexClient()`, not `useConvexClient()`.

### Paginated Queries

For queries that return large datasets, use `usePaginatedQuery()` to load results incrementally. This hook manages cursor-based pagination automatically and provides a `loadMore` function to fetch additional pages.

```svelte
<script lang="ts">
	import { usePaginatedQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api.js';

	const paginatedMessages = usePaginatedQuery(api.messages.listPaginated, () => ({}), {
		initialNumItems: 10
	});
</script>

{#if paginatedMessages.isLoading}
	Loading...
{:else if paginatedMessages.error}
	Error: {paginatedMessages.error.toString()}
{:else}
	<ul>
		{#each paginatedMessages.results as message}
			<li>
				<span>{message.author}</span>
				<span>{message.body}</span>
			</li>
		{/each}
	</ul>
	{#if paginatedMessages.status === 'CanLoadMore'}
		<button onclick={() => paginatedMessages.loadMore(10)}>Load more</button>
	{/if}
{/if}
```

#### Options

- **`initialNumItems`** (required) — number of items to load on the first page
- **`initialData`** — optional initial data for SSR/hydration
- **`keepPreviousData`** — when `true`, keeps previous results visible while loading new data after args change

You can also skip a paginated query by returning `'skip'` from the arguments function, just like with `useQuery()`.

```svelte
<script lang="ts">
	import { usePaginatedQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api.js';

	let searchTerm = $state('');

	const searchResults = usePaginatedQuery(
		api.messages.search,
		() => (searchTerm.length > 0 ? { query: searchTerm } : 'skip'),
		{ initialNumItems: 20, keepPreviousData: true }
	);
</script>
```

### Authentication

#### setupAuth / useAuth

`setupAuth()` accepts a **reactive getter** returning the auth provider's state and automatically manages `client.setAuth()` / `client.clearAuth()`. This mirrors React's `ConvexProviderWithAuth` — when the provider state changes (sign-in, sign-out, token refresh), the auth lifecycle updates automatically.

```svelte
<!-- +layout.svelte -->
<script lang="ts">
	import { setupConvex, setupAuth } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';

	setupConvex(PUBLIC_CONVEX_URL);

	// The getter is reactive — when its return values change,
	// setupAuth automatically toggles setAuth/clearAuth.
	setupAuth(() => ({
		isLoading: false,
		isAuthenticated: !!session,
		fetchAccessToken: async ({ forceRefreshToken }) => {
			if (!session) return null;
			return await getTokenFromYourAuthProvider({ forceRefreshToken });
		}
	}));
</script>
```

`useAuth()` reads the resulting state in any child component:

```svelte
<script lang="ts">
	import { useAuth, useQuery } from 'convex-svelte';
	import { api } from '../convex/_generated/api.js';

	const auth = useAuth();

	const user = useQuery(api.users.getActive, () => (auth.isAuthenticated ? {} : 'skip'));
</script>

{#if auth.isLoading}
	Checking authentication...
{:else if !auth.isAuthenticated}
	Please sign in.
{:else}
	Welcome, {user.data?.name}!
{/if}
```

When the auth provider's `isAuthenticated` changes from `true` to `false` (user signs out), the internal `$effect` re-runs, calls `clearAuth()` automatically, and `useAuth().isAuthenticated` updates to `false`. No manual cleanup needed.

#### SSR initial state

Pass `initialState` to seed the server render before any client-side `$effect` runs:

```svelte
<script lang="ts">
	import { setupConvex, setupAuth } from 'convex-svelte';

	let { data } = $props(); // from +layout.server.ts

	setupConvex(PUBLIC_CONVEX_URL);
	setupAuth(
		() => ({
			isLoading: session.isPending,
			isAuthenticated: !!session.data,
			fetchAccessToken: async ({ forceRefreshToken }) => getToken({ forceRefreshToken })
		}),
		{ initialState: { isAuthenticated: data.isAuthenticated } }
	);
</script>
```

The server state is trusted until the client-side auth flow settles, then the client takes over.

#### Auth adapters

For a complete authentication setup with Better Auth, see [`@mmailaender/convex-better-auth-svelte`](https://github.com/mmailaender/convex-better-auth-svelte). Its `createSvelteAuthClient()` calls `setupAuth()` internally with a reactive session getter, so `useAuth()` from either package works.

#### Low-level: client.setAuth()

You can also use `client.setAuth()` directly for custom integrations:

```svelte
<script lang="ts">
	import { useConvexClient } from 'convex-svelte';

	const client = useConvexClient();

	client.setAuth(
		async () => {
			return await getAuthToken();
		},
		(isAuthenticated) => {
			console.log('Auth state changed:', isAuthenticated);
		}
	);
</script>
```

## SvelteKit

This section builds on [Svelte (Core)](#svelte-core). Make sure `setupConvex()` is in your root layout before using these features.

Import from `convex-svelte/sveltekit` for SvelteKit-specific features: SSR transport with live upgrade, and a server-side HTTP client helper.

> **New to SSR with Convex?** See [Why SSR with Convex?](#why-ssr-with-convex) for a detailed comparison of SSR vs client-side rendering performance.

### SSR with convexLoad / convexLoadPaginated (recommended)

`convexLoad()` and `convexLoadPaginated()` fetch data on the server and automatically upgrade to live subscriptions on the client. No manual `initialData` wiring needed. Use `convexLoad()` for regular queries and `convexLoadPaginated()` for paginated queries.

#### Setup

Add `initConvex()` and the transport hooks to `hooks.ts` (universal hooks — runs on both server and client). `initConvex()` creates the `ConvexClient` singleton early so the transport decoder can upgrade SSR data to live subscriptions. `setupConvex()` in your root layout automatically reuses this singleton.

If you only use `convexLoad()`, you only need the `ConvexLoadResult` transport. Add `ConvexLoadPaginatedResult` when using `convexLoadPaginated()`.

```ts
// hooks.ts
import {
	initConvex,
	encodeConvexLoad,
	decodeConvexLoad,
	encodeConvexLoadPaginated,
	decodeConvexLoadPaginated
} from 'convex-svelte/sveltekit';
import { PUBLIC_CONVEX_URL } from '$env/static/public';

initConvex(PUBLIC_CONVEX_URL);

export const transport = {
	ConvexLoadResult: {
		encode: encodeConvexLoad,
		decode: decodeConvexLoad
	},
	// Only needed if you use convexLoadPaginated()
	ConvexLoadPaginatedResult: {
		encode: encodeConvexLoadPaginated,
		decode: decodeConvexLoadPaginated
	}
};
```

#### Usage with convexLoad

```ts
// +page.ts (universal load function)
import { convexLoad } from 'convex-svelte/sveltekit';
import { api } from '$convex/_generated/api';

export const load = async () => ({
	tasks: await convexLoad(api.tasks.get, {})
});
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
	let { data } = $props();
	const tasks = $derived(data.tasks);
</script>

{#if tasks.isLoading}
	Loading...
{:else if tasks.error}
	Error: {tasks.error.message}
{:else}
	<ul>
		{#each tasks.data as task}
			<li>{task.text}</li>
		{/each}
	</ul>
{/if}
```

The result has the same shape as `useQuery()` — `.data`, `.isLoading`, `.error`, `.isStale` — and is reactive. On first load, data arrives via SSR (no loading flash). After hydration, a live WebSocket subscription takes over automatically.

#### Usage with convexLoadPaginated

`convexLoadPaginated()` works the same way but for paginated queries. It fetches the first page on the server and upgrades to a live paginated subscription on the client — with `loadMore()` support for incremental loading.

```ts
// +page.ts (universal load function)
import { convexLoadPaginated } from 'convex-svelte/sveltekit';
import { api } from '$convex/_generated/api';

export const load = async () => ({
	messages: await convexLoadPaginated(
		api.messages.paginatedList,
		{ muteWords: [] },
		{ initialNumItems: 10 }
	)
});
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
	let { data } = $props();
	const messages = $derived(data.messages);
</script>

{#if messages.isLoading}
	Loading...
{:else if messages.error}
	Error: {messages.error.message}
{:else}
	<ul>
		{#each messages.results as message}
			<li>{message.author}: {message.body}</li>
		{/each}
	</ul>
	{#if messages.status === 'CanLoadMore'}
		<button onclick={() => messages.loadMore(10)}>Load more</button>
	{/if}
{/if}
```

The result has the same shape as `usePaginatedQuery()` — `.results`, `.status`, `.isLoading`, `.error`, `.loadMore()` — and is reactive. On first load, the first page arrives via SSR (no loading flash). After hydration, a live WebSocket subscription takes over and `loadMore()` becomes functional.

#### Authenticated fetches

For authenticated SSR fetches, use `withServerConvexToken` in your server hook. This stores the auth token per-request via `AsyncLocalStorage`, so `convexLoad` and `createConvexHttpClient` pick it up automatically — no `{ token }` option needed.

```ts
// hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { withServerConvexToken } from 'convex-svelte/sveltekit/server';

export const handle: Handle = async ({ event, resolve }) => {
	const token = await getAuthToken(event.cookies); // your auth provider
	event.locals.token = token;
	return withServerConvexToken(token, () => resolve(event));
};
```

Then use `convexLoad` in **any** load function — `+page.ts` or `+page.server.ts`:

```ts
// +page.ts (universal) — works for both SSR and client-side navigation
import { convexLoad } from 'convex-svelte/sveltekit';
import { api } from '$convex/_generated/api';

export const load = async () => ({
	tasks: await convexLoad(api.tasks.get, {})
});
```

The explicit `{ token }` option still works as a manual override:

```ts
// +page.server.ts — explicit token (escape hatch)
export const load = async ({ locals }) => ({
	tasks: await convexLoad(api.tasks.get, {}, { token: locals.token })
});
```

#### Skipping queries

Pass `'skip'` as args to avoid fetching — useful for auth-gated queries that should not run when the user is unauthenticated:

```ts
// +page.server.ts — skip when unauthenticated
export const load = async ({ locals }) => ({
	user: await convexLoad(api.users.get, locals.token ? {} : 'skip')
});
```

When skipped, `convexLoad` returns `{ data: undefined, isLoading: false, error: undefined, isStale: false }` without making any request. `convexLoadPaginated` returns `{ results: [], status: 'Exhausted', isLoading: false, error: undefined, loadMore: () => false }`.

#### Choosing between `+page.ts` and `+page.server.ts`

`convexLoad` works in both universal (`+page.ts`) and server-only (`+page.server.ts`) load functions. The difference is what happens during **client-side navigation** (after the first SSR page load):

- **`+page.ts` (universal):** On client-side navigation, `convexLoad` runs in the browser and queries Convex directly — no server roundtrip. Auth is handled implicitly via the already-authenticated `ConvexClient` singleton (configured by `setupAuth()` in your root layout).
- **`+page.server.ts` (server-only):** On client-side navigation, SvelteKit fetches from your server, which then queries Convex — adding an extra network hop. Auth is always explicit (server-side via `withServerConvexToken` or `locals.token`).

Both produce identical SSR on first page load. Use `+page.ts` for best navigation performance. Use `+page.server.ts` if you need access to server-only data (e.g. `locals`, cookies) or prefer explicit auth handling.

### SSR with initialData (manual alternative)

If you prefer server-only load functions (`+page.server.ts`) or need more control, you can use the `initialData` option on `useQuery()` and `usePaginatedQuery()` directly.

```ts
// +page.server.ts
import { ConvexHttpClient } from 'convex/browser';
import type { PageServerLoad } from './$types.js';
import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { api } from '../convex/_generated/api.js';

export const load = (async () => {
	const client = new ConvexHttpClient(PUBLIC_CONVEX_URL!);
	return {
		messages: await client.query(api.messages.list, { muteWords: [] })
	};
}) satisfies PageServerLoad;
```

```svelte
<script lang="ts">
	// +page.svelte
	import type { PageData } from './$types.js';
	let { data }: { data: PageData } = $props();

	import { useQuery } from 'convex-svelte';
	import { api } from '../convex/_generated/api.js';

	const messages = useQuery(
		api.messages.list,
		() => ({ muteWords: [] }),
		() => ({ initialData: data.messages })
	);
</script>
```

Combining `initialData` with `keepPreviousData: true` (or never changing the query arguments) should be enough to avoid ever seeing a loading state.

> **When to use this over convexLoad**: Use `initialData` when building a library that needs to support Svelte-only, SvelteKit SPA, and SvelteKit SSR without requiring the transport hook setup.

### Server Helpers

#### withServerConvexToken (recommended)

Import from `convex-svelte/sveltekit/server`. Wraps your SvelteKit `resolve()` call to store the auth token per-request via `AsyncLocalStorage`. Both `convexLoad` and `createConvexHttpClient` automatically read it during SSR.

```ts
// hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { withServerConvexToken } from 'convex-svelte/sveltekit/server';

export const handle: Handle = async ({ event, resolve }) => {
	const token = await getAuthToken(event.cookies);
	event.locals.token = token; // still available for direct use
	return withServerConvexToken(token, () => resolve(event));
};
```

```ts
// app.d.ts
declare global {
	namespace App {
		interface Locals {
			token: string | undefined;
		}
	}
}
```

With this setup, `convexLoad()` and `createConvexHttpClient()` automatically authenticate during SSR — no `{ token }` option needed in load functions.

#### Setting up `locals.token` (without withServerConvexToken)

If you prefer not to use `withServerConvexToken`, you can still extract the token and pass it explicitly:

```ts
// hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.token = await getAuthToken(event.cookies);
	return resolve(event);
};
```

Then pass `{ token: locals.token }` to `convexLoad` or `createConvexHttpClient` in each load function.

#### createConvexHttpClient

For server-only code (`+page.server.ts`, form actions, API routes), use `createConvexHttpClient()`:

```ts
// +page.server.ts — with withServerConvexToken (no args needed)
import { createConvexHttpClient } from 'convex-svelte/sveltekit';
import { api } from '$convex/_generated/api';

export const load = async () => {
	const client = createConvexHttpClient();
	const tasks = await client.query(api.tasks.get, {});
	return { tasks };
};
```

Explicit token still works as an override:

```ts
// +page.server.ts — explicit token (escape hatch)
export const load = async ({ locals }) => {
	const client = createConvexHttpClient({ token: locals.token });
	const tasks = await client.query(api.tasks.get, {});
	return { tasks };
};
```

The `url` option falls back to the URL set by `initConvex()`.

## Deploying

See the [Convex deployment guide](https://docs.convex.dev/cli#deploy) for detailed instructions on deploying your app and Convex functions to production.

## Troubleshooting

#### effect_in_teardown Error

If you encounter `effect_in_teardown` errors when using `useQuery` in components that can be conditionally rendered (like dialogs, modals, or popups), this is caused by wrapping `useQuery` in a `$derived` block that depends on reactive state.

When `useQuery` is wrapped in `$derived`, state changes during component cleanup can trigger re-evaluation of the `$derived`, which attempts to create a new `useQuery` instance. Since `useQuery` internally creates a `$effect`, and effects cannot be created during cleanup, this throws an error.

Use [Skipping queries](#skipping-queries) instead. By calling `useQuery` unconditionally at the top level and passing a function that returns `'skip'`, the function is evaluated inside `useQuery`'s own effect tracking, preventing query recreation during cleanup.

#### Missing `setupConvex()` Error

If you see `No ConvexClient was found in Svelte context`, make sure `setupConvex()` is called in a parent layout or component (e.g. `+layout.svelte`) before any child component calls `useQuery()` or `useConvexClient()`.

#### String query names

Query references must be `api.*` function references, not plain strings. If you pass a string like `"messages.list"`, you will get an error. Always import and use `api` from your generated API.

## Why SSR with Convex?

With a realtime backend like Convex, you might wonder whether SSR is worth the effort — after all, the client will open a WebSocket and get live updates anyway. The short answer: **SSR with Convex is almost always faster for time-to-data on first page load.**

### The client-side waterfall

Without SSR, every first page load hits a sequential waterfall:

```
1. Client → Framework server: request page
2. Framework server → Client: HTML shell (empty)        ← skeleton visible
3. Browser parses HTML, discovers <script> tags
4. Browser downloads JavaScript bundle(s)
5. Browser parses + executes JavaScript                  ← 50-200ms on mobile
6. Framework boots, component mounts, useQuery() fires
7. Client → Convex: subscribe to query
8. Convex → Client: data                                ← content visible
```

Steps 3–6 are **dead time** — the user is staring at a skeleton while the browser downloads and executes JS before it can even _start_ talking to Convex.

### SSR eliminates the waterfall

With SSR, your framework server fetches data from Convex while rendering the page. The client receives complete HTML with data in a single response:

```
1. Client → Framework server: request page
2. Server → Convex: fetch data                           ← ~1-5ms if co-located
3. Server renders HTML with data
4. Framework server → Client: complete HTML + data       ← content visible
5. Browser hydrates (attaches event listeners)
6. Client → Convex: WebSocket for live updates           ← background, non-blocking
```

The server uses the time the client would be waiting anyway (for the HTTP response) to productively fetch data. Steps 2–3 happen **inside** the server response time, not after it.

### How much faster?

The difference depends on three factors:

**Device speed** — The biggest variable. On a mid-range mobile phone, JS parse + execute (steps 3–6 in the waterfall) takes 100–300ms. On desktop, 30–80ms. SSR skips this entirely.

**Server-to-Convex distance** — If your framework server is co-located with Convex (same cloud region), the server→Convex hop is ~1–5ms. This is essentially free. Convex currently offers **US East (N. Virginia)** and **EU West (Ireland)** regions.

**Client-to-server distance** — Both approaches need at least one round trip to the framework server. SSR bundles data into that response; client-side adds a second round trip to Convex after JS execution.

A realistic example (user in Germany, framework server in EU, Convex in Ireland):

|                               | SSR                 | Client-side    |
| ----------------------------- | ------------------- | -------------- |
| Skeleton/shell visible        | —                   | ~20ms          |
| **Content with data visible** | **~70ms**           | **~200–400ms** |
| Live updates active           | ~150ms (background) | ~200–400ms     |

### Co-locate your server with Convex

The single biggest optimization: **deploy your framework server in the same region as Convex.**

| Platform       | How to co-locate with Convex                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**     | Set function region to `iad1` (US East) or `dub1` (Ireland) in project settings — default is `iad1`                                                      |
| **Cloudflare** | Enable [Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/) or set explicit placement to match your Convex region |
| **Netlify**    | Use [region selection](https://www.netlify.com/blog/netlify-functions-region-selection/) to match your Convex region                                     |

With co-location, the server→Convex hop is negligible (~1–5ms), and SSR becomes strictly faster than client-side for time-to-data.

### SSR is easy with the SvelteKit transport hook

A common concern is that SSR adds boilerplate. With the [`convexLoad` transport hook](#ssr-with-convexload--convexloadpaginated-recommended), it's minimal — fetch in your load function, use the result directly in the template. No manual `initialData` wiring needed:

```ts
// +page.ts
export const load = async () => ({
	tasks: await convexLoad(api.tasks.get, {})
});
```

The result is a live-updating reactive object that works without `useQuery()` in the component. SSR on first load, live WebSocket updates after hydration — all handled automatically.

### When is client-side rendering acceptable?

SSR delivers a better experience in virtually every scenario. Client-side rendering is not _faster_ — it just shows a skeleton sooner while the user waits longer for actual data. That said, skipping SSR is acceptable when:

- **Authenticated app-like UIs** (dashboards, admin panels) — users have longer sessions where the one-time initial load cost is amortized, and SEO is irrelevant
- **Rapid prototyping** — when you want to iterate quickly and add SSR later

Even in these cases, SSR would still provide a faster first load. The trade-off is development effort, not performance.

Note that **subsequent navigations are always client-side** regardless of your SSR choice. After the initial page load, SvelteKit does client-side routing and the Convex WebSocket is already open — data loads without any framework server round trip.

> **Recommendation:** Default to SSR. It is faster for time-to-data in every realistic deployment, and with the transport hook it requires minimal effort. Only skip SSR if you have a specific reason to.

## API Reference

### `convex-svelte` exports

Import from `convex-svelte`:

| Export                                    | Kind     | Description                                                                                                      |
| ----------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `setupConvex(url, options?)`              | Function | Initialize the Convex client and store it in Svelte context. Call once in a root layout. Returns `ConvexClient`. |
| `useConvexClient()`                       | Function | Retrieve the `ConvexClient` from Svelte context. Must be called during component initialization.                 |
| `getConvexClient()`                       | Function | Retrieve the `ConvexClient` module singleton. Works anywhere — no Svelte context needed.                         |
| `useQuery(query, args, options?)`         | Function | Subscribe to a Convex query with reactive updates. Returns `UseQueryReturn`.                                     |
| `UseQueryOptions<Query>`                  | Type     | Options for `useQuery`: `initialData`, `keepPreviousData`.                                                       |
| `UseQueryReturn<Query>`                   | Type     | Return type of `useQuery`: `data`, `error`, `isLoading`, `isStale`.                                              |
| `usePaginatedQuery(query, args, options)` | Function | Subscribe to a paginated Convex query with cursor management. Returns `UsePaginatedQueryReturn`.                 |
| `UsePaginatedQueryOptions<Query>`         | Type     | Options for `usePaginatedQuery`: `initialNumItems`, `initialData`, `keepPreviousData`.                           |
| `UsePaginatedQueryReturn<Query>`          | Type     | Return type of `usePaginatedQuery`: `results`, `status`, `isLoading`, `loadMore`, `error`.                       |
| `setupAuth(provider, options?)`           | Function | Set up reactive authentication. Manages `setAuth`/`clearAuth` automatically.                                     |
| `ConvexAuthProvider`                      | Type     | Auth provider state: `isLoading`, `isAuthenticated`, `fetchAccessToken`.                                         |
| `SetupAuthOptions`                        | Type     | Options for `setupAuth`: `initialState` for SSR hydration.                                                       |
| `useAuth()`                               | Function | Read auth state (`isLoading`, `isAuthenticated`) from context.                                                   |
| `UseAuthReturn`                           | Type     | Return type of `useAuth`: `isLoading`, `isAuthenticated`.                                                        |

### `convex-svelte/sveltekit` exports

Import from `convex-svelte/sveltekit`:

| Export                                      | Kind     | Description                                                                                           |
| ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `initConvex(url, options?)`                 | Function | Create the `ConvexClient` singleton early. Only needed for [convexLoad SSR setup](#convexload-setup). |
| `getConvexUrl()`                            | Function | Retrieve the deployment URL set by `initConvex()` or `setupConvex()`.                                 |
| `convexLoad(query, args, options?)`         | Function | Fetch data server-side, upgrade to live subscription on client.                                       |
| `encodeConvexLoad`                          | Function | Transport encoder — use in `hooks.ts` (see [convexLoad Setup](#convexload-setup)).                    |
| `decodeConvexLoad`                          | Function | Transport decoder — use in `hooks.ts` (see [convexLoad Setup](#convexload-setup)).                    |
| `convexLoadPaginated(query, args, options)` | Function | Fetch first page server-side, upgrade to live paginated subscription on client.                       |
| `encodeConvexLoadPaginated`                 | Function | Paginated transport encoder — use in `hooks.ts`.                                                      |
| `decodeConvexLoadPaginated`                 | Function | Paginated transport decoder — use in `hooks.ts`.                                                      |
| `createConvexHttpClient(options?)`          | Function | Create a `ConvexHttpClient` for server-side use.                                                      |
| `CreateConvexHttpClientOptions`             | Type     | Options for `createConvexHttpClient`: `url`, `token`, `options`.                                      |
