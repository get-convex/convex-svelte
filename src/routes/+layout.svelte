<script lang="ts">
	import './layout.css';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex } from '../lib/index.js';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const { children } = $props();
	setupConvex(PUBLIC_CONVEX_URL);

	const navLinks = [
		{ path: '/', label: 'Home' },
		{ path: '/tests', label: 'Tests' }
	] as const;
</script>

<div class="min-h-screen bg-gray-50">
	<header class="sticky top-0 z-10 border-b border-gray-200 bg-white">
		<nav class="mx-auto max-w-4xl px-4 py-3">
			<div class="flex items-center justify-between">
				<a href={resolve('/')} class="font-semibold text-gray-900 hover:text-gray-700">
					convex-svelte
				</a>
				<ul class="flex items-center gap-1 text-sm">
					{#each navLinks as link (link.path)}
						<li>
							<a
								href={resolve(link.path)}
								class="rounded-md px-3 py-1.5 transition-colors {page.url.pathname === link.path
									? 'bg-gray-100 font-medium text-gray-900'
									: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
							>
								{link.label}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-4xl px-4 py-6">
		{@render children()}
	</main>

	<footer class="border-t border-gray-200 bg-white">
		<div class="mx-auto max-w-4xl px-4 py-4 text-center text-sm text-gray-500">
			<p>
				Visit <a href="https://svelte.dev" class="font-semibold text-gray-700 hover:text-gray-900"
					>svelte.dev</a
				>
				to learn Svelte and
				<a href="https://docs.convex.dev" class="font-semibold text-gray-700 hover:text-gray-900"
					>docs.convex.dev</a
				> to learn Convex
			</p>
		</div>
	</footer>
</div>
