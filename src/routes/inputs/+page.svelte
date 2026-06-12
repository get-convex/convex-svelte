<script lang="ts">
	import Inputs from './Inputs.svelte';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Inputs</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<div class="mx-auto max-w-2xl">
	<a
		href={resolve('/')}
		class="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-convex-ink/50 transition-colors hover:text-convex-purple"
	>
		<svg
			class="h-4 w-4"
			viewBox="0 0 20 20"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M16 10H4m5 5-5-5 5-5" />
		</svg>
		Back to demos
	</a>
	<h1 class="mb-2 text-3xl font-bold tracking-tight">Modifying Several Inputs</h1>
	<p class="mb-8 text-convex-ink/60">
		Any user has complete control over these inputs but might change them quickly.
	</p>

	<div class="overflow-hidden rounded-2xl border border-convex-ink/10 bg-white shadow-sm">
		<Inputs />
	</div>
</div>
