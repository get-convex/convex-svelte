<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { ConvexProvider } from '../lib/index.js';

	const { children } = $props();
	let show = $state(true);
	console.log('env.PUBLIC_CONVEX_URL', env.PUBLIC_CONVEX_URL);
</script>

<div class="app">
	<main>
		<ConvexProvider url={env.PUBLIC_CONVEX_URL}>
			{@render children()}
		</ConvexProvider>
	</main>

	<footer>
		<p>
			visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to learn SvelteKit and
			<a href="https://docs.convex.dev">docs.convex.dev</a> to learn Convex
		</p>
	</footer>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 1rem;
		width: 100%;
		max-width: 64rem;
		margin: 0 auto;
		box-sizing: border-box;
	}

	footer {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 12px;
	}

	footer a {
		font-weight: bold;
	}

	@media (min-width: 480px) {
		footer {
			padding: 12px 0;
		}
	}
</style>
