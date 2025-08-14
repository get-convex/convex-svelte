<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex } from '../lib/index.js';

	const { children } = $props();
	setupConvex(PUBLIC_CONVEX_URL);
</script>

<div class="app">
	<main>
		{@render children()}
	</main>

	<footer>
		<p>
			The project uses
			<a href="https://github.com/get-convex/convex-svelte">convex-svelte</a>,
			<a href="https://docs.convex.dev">Convex</a>,
			and
			<a href="https://kit.svelte.dev">SvelteKit</a>
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
