<script lang="ts">
	import { useAuth } from '$lib/index.js';
	import { setSignedIn } from './+layout.svelte';

	const auth = useAuth();

	function handleSignOut() {
		setSignedIn(false);
	}
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-bold text-gray-900">Auth Clear Test</h1>

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

	<button
		data-testid="clear-auth-btn"
		onclick={handleSignOut}
		class="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
		>Sign Out</button
	>
</section>
