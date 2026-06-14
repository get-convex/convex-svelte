<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/convex-logo-color.svg';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex } from '../lib/index.js';
	import { resolve } from '$app/paths';

	const { children } = $props();
	setupConvex(PUBLIC_CONVEX_URL);
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

				<ul class="flex items-center gap-1 text-sm font-semibold">
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
					<li>
						<a
							href="https://github.com/get-convex/convex-svelte"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="convex-svelte on GitHub"
							class="flex items-center rounded-full p-3 text-convex-ink transition-colors hover:bg-convex-sand"
						>
							<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path
									d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.438 9.63 8.205 11.19.6.11.82-.26.82-.577 0-.285-.01-1.04-.015-2.04-3.338.72-4.042-1.61-4.042-1.61-.546-1.385-1.333-1.755-1.333-1.755-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.235 1.84 1.235 1.07 1.83 2.807 1.3 3.492.995.108-.776.42-1.305.762-1.605-2.665-.3-5.466-1.325-5.466-5.9 0-1.305.467-2.37 1.235-3.205-.135-.3-.54-1.515.105-3.16 0 0 1.005-.32 3.3 1.225.96-.265 1.98-.395 3-.4 1.02.005 2.04.135 3 .4 2.28-1.545 3.285-1.225 3.285-1.225.645 1.645.24 2.86.12 3.16.765.835 1.23 1.9 1.23 3.205 0 4.585-2.805 5.595-5.475 5.89.42.36.81 1.096.81 2.22 0 1.605-.015 2.895-.015 3.29 0 .315.21.69.825.57C20.565 21.915 24 17.495 24 12.29 24 5.78 18.627.5 12 .5z"
								/>
							</svg>
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
