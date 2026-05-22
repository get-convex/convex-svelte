<script lang="ts">
	import { useQuery, useConvexClient } from '$lib/client.svelte.js';
	import { api } from '../../convex/_generated/api.js';

	const convex = useConvexClient();
	const serverNumbers = useQuery(api.numbers.get, {});

	let numbers: { a: number; b: number; c: number } | null = $state(null);
	// Have some changes not yet been sent?
	let hasUnsentChanges = $state(false);
	// Does delivered server state not yet reflect all local changes?
	let hasUnsavedChanges = $state(false);
	let mutationInFlight = $state(false);

	// Initialize local state when server data first arrives
	$effect(() => {
		if (!serverNumbers.isLoading && serverNumbers.data && !numbers) {
			numbers = { ...serverNumbers.data };
		}
	});

	// Update local state with server data
	$effect(() => {
		if (!hasUnsavedChanges && !serverNumbers.isLoading && serverNumbers.data) {
			numbers = { ...serverNumbers.data };
		}
	});

	async function publishChanges() {
		hasUnsentChanges = true;
		hasUnsavedChanges = true;
		if (!numbers || mutationInFlight) return;

		hasUnsentChanges = false;
		mutationInFlight = true;
		await convex.mutation(api.numbers.update, numbers);
		mutationInFlight = false;

		if (hasUnsentChanges) {
			publishChanges();
		} else {
			hasUnsavedChanges = false;
		}
	}

	function handleNumericInput(
		prop: 'a' | 'b' | 'c',
		e: Event & { currentTarget: HTMLInputElement }
	) {
		if (!numbers) return;
		numbers[prop] = e.currentTarget.valueAsNumber;
		publishChanges();
	}
</script>

<div class="flex flex-col gap-6">
	{#if serverNumbers.isLoading || !numbers}
		<p class="text-sm text-gray-500">Loading values...</p>
	{:else}
		<div class="grid gap-4 sm:grid-cols-3">
			<div class="flex flex-col gap-1">
				<label for="a" class="text-sm font-medium text-gray-700">Number a</label>
				<input
					id="a"
					type="number"
					oninput={(e) => handleNumericInput('a', e)}
					value={numbers.a}
					class="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="b" class="text-sm font-medium text-gray-700">Number b</label>
				<input
					id="b"
					type="number"
					oninput={(e) => handleNumericInput('b', e)}
					value={numbers.b}
					class="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="c" class="text-sm font-medium text-gray-700">Number c</label>
				<input
					id="c"
					type="number"
					oninput={(e) => handleNumericInput('c', e)}
					value={numbers.c}
					class="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
			</div>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="rounded-md bg-gray-50 p-4">
				<p class="mb-2 text-sm font-semibold text-gray-800">Local values</p>
				<ul class="space-y-1 text-sm text-gray-600">
					<li>a: {numbers.a}</li>
					<li>b: {numbers.b}</li>
					<li>c: {numbers.c}</li>
				</ul>
			</div>
			<div class="rounded-md bg-gray-50 p-4">
				<p class="mb-2 text-sm font-semibold text-gray-800">Server values</p>
				<ul class="space-y-1 text-sm text-gray-600">
					<li>a: {serverNumbers.data?.a}</li>
					<li>b: {serverNumbers.data?.b}</li>
					<li>c: {serverNumbers.data?.c}</li>
				</ul>
			</div>
		</div>
	{/if}
</div>
