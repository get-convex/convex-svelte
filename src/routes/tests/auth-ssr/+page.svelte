<script lang="ts">
	import { useAuth } from '$lib/index.js';

	const auth = useAuth();
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">Auth SSR Test</h1>

	<div data-testid="auth-state" class="rounded-lg border border-gray-200 bg-gray-50 p-4">
		{#if auth.isLoading}
			<p data-testid="auth-loading" class="text-sm text-blue-600">Auth Loading</p>
		{:else if auth.isAuthenticated}
			<p data-testid="auth-authenticated" class="text-sm text-green-700">Authenticated</p>
		{:else}
			<p data-testid="auth-unauthenticated" class="text-sm text-amber-700">Unauthenticated</p>
		{/if}
	</div>

	<div data-testid="auth-values" class="space-y-1 text-sm text-gray-600">
		<p data-testid="is-loading">isLoading: {auth.isLoading}</p>
		<p data-testid="is-authenticated">isAuthenticated: {auth.isAuthenticated}</p>
	</div>
</section>
