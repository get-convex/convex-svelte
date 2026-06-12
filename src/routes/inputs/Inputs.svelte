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

<div class="flex flex-col">
	{#if serverNumbers.isLoading || !numbers}
		<div class="flex flex-col items-center justify-center gap-2 px-5 py-12">
			<span
				class="h-5 w-5 animate-spin rounded-full border-2 border-convex-ink/20 border-t-convex-purple"
				aria-hidden="true"
			></span>
			<p class="text-sm text-convex-ink/50">Loading values…</p>
		</div>
	{:else}
		<div
			class="flex items-center justify-between border-b border-convex-ink/10 bg-convex-sand/40 px-5 py-3"
		>
			<span class="text-xs font-medium tracking-wide text-convex-ink/40 uppercase"
				>Shared realtime state</span
			>
			{#if mutationInFlight || hasUnsavedChanges}
				<span
					class="inline-flex items-center gap-1.5 rounded-full bg-convex-yellow/20 px-2.5 py-1 text-xs font-semibold text-amber-700"
				>
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-convex-yellow"></span>
					Syncing…
				</span>
			{:else}
				<span
					class="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-700"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
					Synced
				</span>
			{/if}
		</div>

		<div class="flex flex-col gap-6 px-5 py-5">
			<div class="grid gap-4 sm:grid-cols-3">
				{#each ['a', 'b', 'c'] as const as prop (prop)}
					<div class="flex flex-col gap-1.5">
						<label
							for={prop}
							class="text-xs font-semibold tracking-wide text-convex-ink/50 uppercase"
							>Number {prop}</label
						>
						<input
							id={prop}
							type="number"
							oninput={(e) => handleNumericInput(prop, e)}
							value={numbers[prop]}
							class="rounded-xl border border-convex-ink/15 bg-white px-3.5 py-2.5 font-mono text-base shadow-sm transition-colors focus:border-convex-purple focus:ring-2 focus:ring-convex-purple/20 focus:outline-none"
						/>
					</div>
				{/each}
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="rounded-xl border border-convex-ink/10 bg-convex-sand/40 p-4">
					<p class="mb-3 text-xs font-semibold tracking-wide text-convex-ink/50 uppercase">
						Local values
					</p>
					<ul class="space-y-1.5 font-mono text-sm">
						{#each ['a', 'b', 'c'] as const as prop (prop)}
							<li class="flex items-center justify-between">
								<span class="text-convex-ink/50">{prop}</span>
								<span class="font-semibold">{numbers[prop]}</span>
							</li>
						{/each}
					</ul>
				</div>
				<div class="rounded-xl border border-convex-ink/10 bg-convex-sand/40 p-4">
					<p class="mb-3 text-xs font-semibold tracking-wide text-convex-ink/50 uppercase">
						Server values
					</p>
					<ul class="space-y-1.5 font-mono text-sm">
						{#each ['a', 'b', 'c'] as const as prop (prop)}
							<li class="flex items-center justify-between">
								<span class="text-convex-ink/50">{prop}</span>
								<span
									class="font-semibold {serverNumbers.data?.[prop] !== numbers[prop]
										? 'rounded bg-convex-yellow/30 px-1.5 text-amber-800'
										: ''}">{serverNumbers.data?.[prop]}</span
								>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}
</div>
