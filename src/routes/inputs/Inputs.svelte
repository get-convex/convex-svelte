<script lang="ts">
	import { useQuery, useConvexClient } from '$lib/client.svelte.js';
	import type { Doc } from '../../convex/_generated/dataModel.js';
	import { api } from '../../convex/_generated/api.js';

	const convex = useConvexClient();
	const serverNumbers = useQuery(api.numbers.get, {});

	let numbers = $state(null);
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

	function handleNumericInput(prop, e) {
		numbers[prop] = e.currentTarget.valueAsNumber;
		publishChanges();
	}
</script>

<div class="numbers">
	{#if serverNumbers.isLoading || !numbers}
		<div>
			<p>Loading values...</p>
		</div>
	{:else}
		<div>
			<label for="a">Number a:</label>
			<input id="a" type="number" oninput={(e) => handleNumericInput('a', e)} value={numbers.a} />
		</div>

		<div>
			<label for="b">Number b:</label>
			<input id="b" type="number" oninput={(e) => handleNumericInput('b', e)} value={numbers.b} />
		</div>

		<div>
			<label for="c">Number c:</label>
			<input id="c" type="number" oninput={(e) => handleNumericInput('c', e)} value={numbers.c} />
		</div>

		<div>
			<p>Local values:</p>
			<ul>
				<li>a: {numbers.a}</li>
				<li>b: {numbers.b}</li>
				<li>c: {numbers.c}</li>
			</ul>
		</div>

		<div>
			<p>Server values:</p>
			<ul>
				<li>a: {serverNumbers.data.a}</li>
				<li>b: {serverNumbers.data.b}</li>
				<li>c: {serverNumbers.data.c}</li>
			</ul>
		</div>
	{/if}
</div>
