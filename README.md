# convex-svelte

Convex client for Svelte.

See the [example app live](https://convex-svelte.vercel.app/).

Currently exposes a `ConvexProvider` component which takes a Convex deployment URL, a `useConvexClient()` and a `useQuery()`.

### Example

See [+layout.svelte](src/routes/+layout.svelte) for how to wrap your application in a Convex provider component

```svelte
<ConvexProvider url={PUBLIC_CONVEX_URL}>
	{@render children()}
</ConvexProvider>
```

and [Chat.svelte](src/routes/Chat.svelte) for how to use useQuery

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

# Deploying a Svelte App

In production the build command you should use is

```bash
npx convex deploy --cmd-url-env-var-name PUBLIC_CONVEX_URL --cmd 'npm run build'
```

# SvelteKit Library Instructions

## Developing

Once you've created a project and installed dependencies with `npm install` start a development server:

```bash
npm run dev
```

This will run you through creating a Convex account and a deployment.

Everything inside `src/lib` is part of the library, everything inside `src/routes` is an example app.

## Building

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
