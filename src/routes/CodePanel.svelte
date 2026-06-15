<script lang="ts">
	import CopyButton from './CopyButton.svelte';
	let { code }: { code: string } = $props();
</script>

<div class="border-b border-convex-ink/10 bg-convex-ink">
	<div class="flex items-center justify-between px-4 pt-3">
		<div class="flex items-center gap-1.5" aria-hidden="true">
			<span class="h-2.5 w-2.5 rounded-full bg-convex-red/80"></span>
			<span class="h-2.5 w-2.5 rounded-full bg-convex-yellow/80"></span>
			<span class="h-2.5 w-2.5 rounded-full bg-convex-purple"></span>
		</div>
		<CopyButton value={code} />
	</div>
	<pre
		class="overflow-x-auto px-4 pt-2 pb-3 font-mono text-xs leading-relaxed text-convex-cream/80"><code
			>{code}</code
		></pre>
</div>
