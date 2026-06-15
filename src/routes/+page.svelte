<script lang="ts">
	import Chat from './Chat.svelte';
	import CopyButton from './CopyButton.svelte';
	import type { PageData } from './$types.js';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>convex-svelte</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<div class="mx-auto max-w-2xl">
	<div class="mb-8">
		<span
			class="mb-4 inline-flex items-center gap-2 rounded-full border border-convex-ink/10 bg-white px-3 py-1 text-xs font-medium text-convex-ink/70 shadow-sm"
		>
			<span class="relative flex h-2 w-2">
				<span
					class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60"
				></span>
				<span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
			</span>
			Realtime sync, live on this page
		</span>
		<h1 class="mb-3 text-5xl font-bold tracking-tight">
			convex-svelte
			<span
				class="block bg-linear-to-r from-convex-red via-convex-yellow to-convex-purple bg-clip-text text-transparent"
				>realtime by default.</span
			>
		</h1>
		<p class="max-w-lg text-convex-ink/60">
			Real-time Convex integration for Svelte/SvelteKit. The demo below is backed by live queries —
			open a second tab and watch it sync.
		</p>
		<div
			class="mt-5 inline-flex items-center gap-2 rounded-lg border border-convex-ink/10 bg-convex-ink py-1.5 pr-1.5 pl-3 font-mono text-xs text-convex-cream/80 shadow-sm"
		>
			<span class="text-convex-cream/40">$</span>
			npm i convex-svelte
			<CopyButton value="npm i convex-svelte" compact />
		</div>
	</div>

	<section class="mb-12">
		<div class="mb-4 flex items-baseline justify-between">
			<h2 class="text-xl font-semibold tracking-tight">Chat Demo</h2>
			<span class="text-xs font-medium tracking-wide text-convex-ink/40 uppercase"
				>usePaginatedQuery · optimistic updates</span
			>
		</div>
		<div class="overflow-hidden rounded-2xl border border-convex-ink/10 bg-white shadow-sm">
			<Chat initialMessages={data.messages} />
		</div>
	</section>
</div>
