<script lang="ts">
	import Chat from './Chat.svelte';
	import type { PageData } from './$types.js';
	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>convex-svelte</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<div class="mx-auto max-w-2xl">
	<div class="mb-12">
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
		<h1 class="mb-3 text-4xl font-bold tracking-tight">
			convex-svelte
			<span
				class="block bg-linear-to-r from-convex-red via-convex-yellow to-convex-purple bg-clip-text text-transparent"
				>realtime by default.</span
			>
		</h1>
		<p class="max-w-lg text-lg text-convex-ink/60">
			Real-time Convex integration for Svelte/SvelteKit. Every demo below is backed by live
			queries — open a second tab and watch it sync.
		</p>
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

	<section class="mb-12">
		<div class="mb-4 flex items-baseline justify-between">
			<h2 class="text-xl font-semibold tracking-tight">Inputs Demo</h2>
			<span class="text-xs font-medium tracking-wide text-convex-ink/40 uppercase"
				>useQuery · shared state</span
			>
		</div>
		<a
			href={resolve('/inputs')}
			class="group flex items-center justify-between gap-4 rounded-2xl border border-convex-ink/10 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-convex-purple/40 hover:shadow-md"
		>
			<div>
				<h3 class="text-lg font-semibold group-hover:text-convex-purple">
					Modifying Several Inputs
				</h3>
				<p class="mt-1 text-sm text-convex-ink/60">
					Any user has complete control over these inputs but might change them quickly.
				</p>
				<span
					class="mt-3 inline-block rounded-full bg-convex-sand px-2.5 py-0.5 font-mono text-xs text-convex-ink/70"
					>/inputs</span
				>
			</div>
			<svg
				class="h-5 w-5 shrink-0 text-convex-ink/30 transition-all group-hover:translate-x-1 group-hover:text-convex-purple"
				viewBox="0 0 20 20"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M4 10h12m-5-5 5 5-5 5" />
			</svg>
		</a>
	</section>
</div>
