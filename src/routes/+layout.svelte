<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/convex-logo-color.svg';
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

<div class="flex min-h-screen flex-col bg-convex-cream text-convex-ink antialiased">
	<header
		class="sticky top-0 z-50 bg-convex-cream/95 backdrop-blur-sm shadow-[0_1px_0_rgba(20,20,20,0.08)]"
	>
		<nav class="mx-auto max-w-4xl px-4">
			<div class="flex items-center justify-between">
				<a
					href={resolve('/')}
					class="group flex items-center transition-opacity hover:opacity-70"
					aria-label="convex-svelte home"
				>
					<img src={favicon} alt="Convex" class="h-auto w-44 shrink-0" />

					<span class="text-base font-semibold tracking-tight text-convex-ink"> svelte </span>
				</a>

				<ul class="flex items-center gap-2 text-sm font-semibold">
					{#each navLinks as link (link.path)}
						<li>
							<a
								href={resolve(link.path)}
								class="rounded-full px-5 py-3 transition-colors {page.url.pathname === link.path
									? 'bg-convex-sand text-convex-ink'
									: 'text-convex-ink hover:bg-convex-sand'}"
							>
								{link.label}
							</a>
						</li>
					{/each}
					<li>
						<a
							href="https://docs.convex.dev/client/svelte"
							target="_blank"
							rel="noopener noreferrer"
							class="rounded-full px-5 py-3 text-convex-ink transition-colors hover:bg-convex-sand"
						>
							Docs
						</a>
					</li>
				</ul>
			</div>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
		{@render children()}
	</main>

	<footer class="border-t border-white/10 bg-convex-ink">
		<div class="mx-auto max-w-4xl px-4 py-5 text-center text-sm text-white/60">
			<p>
				Visit <a
					href="https://svelte.dev"
					class="font-semibold text-white/90 transition-colors hover:text-convex-yellow"
					>svelte.dev</a
				>
				to learn Svelte and
				<a
					href="https://docs.convex.dev"
					class="font-semibold text-white/90 transition-colors hover:text-convex-yellow"
					>docs.convex.dev</a
				> to learn Convex
			</p>
		</div>
	</footer>
</div>
