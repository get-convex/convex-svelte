<script lang="ts">
	let { value, compact = false }: { value: string; compact?: boolean } = $props();

	let copied = $state(false);
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			clearTimeout(resetTimer);
			resetTimer = setTimeout(() => (copied = false), 1500);
		} catch {
			// Clipboard can be unavailable (insecure context, denied permission) — ignore.
		}
	}
</script>

<button
	type="button"
	onclick={copy}
	aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
	class="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-convex-cream/50 transition-colors hover:bg-convex-cream/10 hover:text-convex-cream/90"
>
	{#if copied}
		<svg
			class="h-3.5 w-3.5 text-green-400"
			viewBox="0 0 20 20"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m4 10 4 4 8-9" />
		</svg>
		{#if !compact}Copied{/if}
	{:else}
		<svg
			class="h-3.5 w-3.5"
			viewBox="0 0 20 20"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<rect x="6" y="6" width="10" height="12" rx="2" />
			<path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h0A1.5 1.5 0 0 1 12 4.5V6" />
		</svg>
		{#if !compact}Copy{/if}
	{/if}
</button>
