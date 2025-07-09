[Convex](https://www.convex.dev/) is the typesafe backend-as-a-service with realtime updates, server functions, crons and scheduled jobs, file storage, vector search, and more.

[Quickstart](https://docs.convex.dev/quickstart/svelte)

# convex-svelte

Receive live updates to Convex query subscriptions and call mutations and actions from Svelte with `convex-svelte`.

To install:

```
npm install convex convex-svelte
```

Run `npx convex init` to get started with Convex.

See the [example app live](https://convex-svelte.vercel.app/).

`convex-svelte` provides a `setupConvex()` function which takes a Convex deployment URL,
a `useConvexClient()` which returns a [ConvexClient](https://docs.convex.dev/api/classes/browser.ConvexClient)
used to set authentication credentials and run Convex mutations and actions,
and a `useQuery()` function for subscribing to Convex queries.

### Example

Call `setupConvex()` in a component above the components that need to Convex queries
and use `useQuery()` components where you need to listen to the query.

See [+layout.svelte](src/routes/+layout.svelte) for `setupConvex()`

```svelte
<script>
	import { PUBLIC_CONVEX_URL } from '$env/static/public';

	setupConvex(PUBLIC_CONVEX_URL);
</script>
```

and [Chat.svelte](src/routes/Chat.svelte) for how to use `useQuery()`

```svelte
<script>
	const query = useQuery(api.messages.list, () => ({ muteWords }), {
		useResultFromPreviousArguments: true
	});
</script>

...
{#if query.isLoading}
	Loading...
{:else if query.error != null}
	failed to load: {query.error.toString()}
{:else}
	<ul>
		{#each query.data as message}
			<li>
				<span>{message.author}</span>
				<span>{message.body}</span>
			</li>
		{/each}
	</ul>
{/if}
```

Running a mutation looks like

```svelte
<script>
import { api } from "../../convex/_generated/api.js"; // depending on file location
import { useConvexClient, useQuery } from "convex-svelte";
const client = useConvexClient();

let toSend = $state('');
let author = $state('me');

function onSubmit(e: SubmitEvent) {
	const data = Object.fromEntries(new FormData(e.target as HTMLFormElement).entries());
	client.mutation(api.messages.send, {
		author: data.author as string,
		body: data.body as string
	});
}
</script>

<form on:submit|preventDefault={onSubmit}>
	<input type="text" id="author" name="author" />
	<input type="text" id="body" name="body" bind:value={toSend} />
	<button type="submit" disabled={!toSend}>Send</button>
</form>
```

### Server-side rendering

`useQuery()` accepts an `initialData` option in its third argument.
By defining a `load()` function in a +page.server.ts file
that uses the `ConvexHttpClient` to request the same query to get initial data
and passing that through to the `initialData` option of a useQuery call you can avoid an initial loading state.

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

	import { useQuery, useConvexClient } from '$lib/client.svelte.js';
	import { api } from '../convex/_generated/api.js';

	const messages = useQuery(
		api.messages.list,
		() => args,
		() => ({ initialData: data.messages })
	);
</script>
```

Combining specifying `initialData` and either setting the `keepPreviousData` option to true or never modifying the arguments passed to a query should be enough to avoid ever seeing a loading state for a `useQuery()`.

### Deploying a Svelte App

In production build pipelines use the build command

```bash
npx convex deploy --cmd-url-env-var-name PUBLIC_CONVEX_URL --cmd 'npm run build'
```

to build your Svelte app and deploy Convex functions.

# Trying out this library

Clone this repo and install dependencies with `npm install` then start a development server:

```bash
npm run dev
```

This will run you through creating a Convex account and a deployment.

Everything inside `src/lib` is part of the library, everything inside `src/routes` is an example app.

# Developing this library

To build the library:

```bash
npm run package
```

To create a production version of the showcase app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.

## Publishing

Go into the `package.json` and give your package the desired name through the `"name"` option. Also consider adding a `"license"` field and point it to a `LICENSE` file which you can create from a template (one popular option is the [MIT license](https://opensource.org/license/mit/)).

To publish your library to [npm](https://www.npmjs.com):

```bash
npm publish
```
