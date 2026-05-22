<script lang="ts">
	import Chat from './Chat.svelte';
	import type { PageData } from './$types.js';
	import { resolve } from '$app/paths';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-2 text-3xl font-bold text-gray-900">convex-svelte</h1>
	<p class="mb-8 text-gray-600">Real-time Convex integration for Svelte/SvelteKit</p>

	<section class="mb-10">
		<h2 class="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-800">
			<span class="h-2 w-2 rounded-full bg-green-500"></span>
			Chat Demo
		</h2>
		<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<Chat initialMessages={data.messages} />
		</div>
	</section>

	<section class="mb-10">
		<h2 class="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-800">
			<span class="h-2 w-2 rounded-full bg-blue-500"></span>
			Inputs Demo
		</h2>
		<a
			href={resolve('/inputs')}
			class="block rounded-lg border border-blue-200 bg-white p-4 shadow transition-shadow hover:border-blue-400 hover:shadow-md"
		>
			<h3 class="text-lg font-semibold text-gray-900">Modifying Several Inputs</h3>
			<p class="mt-1 text-sm text-gray-600">
				Any user has complete control over these inputs but might change them quickly.
			</p>
			<span class="mt-2 inline-block text-xs text-blue-600">/inputs</span>
		</a>
	</section>
</div>
