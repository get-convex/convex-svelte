<script lang="ts">
	import { useQuery, useConvexClient } from '$lib/client.svelte.js';
	import type { Doc } from '../../convex/_generated/dataModel.js';
	import { api } from '../../convex/_generated/api.js';

	const convex = useConvexClient();
	const serverNumbers = useQuery(api.numbers.get, {});

	let numbers = $state(serverNumbers.isLoading ? {} : { a: serverNumbers.a, b: serverNumbers.b, c: serverNumbers.c });
	let pendingMutations = $state(0);
	let lastMutationPromise: Promise<any> | null = $state(null);
	let hasUnsentChanges = $state(false);  // Track if we have changes waiting in debounce

	// Stay in sync with server data only when no mutations are pending and there are now changes waiting to be sent
	$effect(() => {
	    if (!serverNumbers.isLoading && serverNumbers.data && 
		pendingMutations === 0 && !hasUnsentChanges) {
		console.log('Received data from server:', {
		    a: serverNumbers.data.a,
		    b: serverNumbers.data.b,
		    c: serverNumbers.data.c,
		});
		numbers.a = serverNumbers.data.a;
		numbers.b = serverNumbers.data.b;
		numbers.c = serverNumbers.data.c;
	    }
	});

	// Queue updates and track pending mutations
	async function queueMutation() {
	    if (serverNumbers.isLoading) return;

	    pendingMutations++;
	    hasUnsentChanges = false;

	    console.log('Updating server with', numbers, pendingMutations, 'mutations pending');
	    const currentMutation = convex.mutation(api.numbers.update, {
		a: numbers.a,
		b: numbers.b,
		c: numbers.c
	    });

	    lastMutationPromise = currentMutation;

	    try {
		await currentMutation;
		console.log('saved to server');
	    } finally {
		pendingMutations--;
		
		// If this was the last mutation in the queue,
		// explicitly sync with server state
		if (pendingMutations === 0 && !hasUnsentChanges && 
		    serverNumbers.data && currentMutation === lastMutationPromise) {
		    console.log('finished persisting state to server, back to following useQuery');
		    numbers.a = serverNumbers.data.a;
		    numbers.b = serverNumbers.data.b;
		    numbers.c = serverNumbers.data.c;
		}
	    }
	}

	// Track changes immediately but debounce the actual mutation
	let updateTimeout: number | undefined;
	$effect(() => {
           if (serverNumbers.isLoading) return;

	    // reference values so this is reactive on them
	    const currentValues = {
		a: numbers.a,
		b: numbers.b,
		c: numbers.c
	    };
	    hasUnsentChanges = true;
	    
	    clearTimeout(updateTimeout);
	    updateTimeout = setTimeout(queueMutation, 500) as unknown as number;

	    return () => clearTimeout(updateTimeout);
	});
</script>

<div class="numbers">
    {#if serverNumbers.isLoading}
        <div>
            <p>Loading values...</p>
        </div>
    {:else}
        <div>
            <label for="a">Number a:</label>
            <input 
                id="a"
                type="number"
                bind:value={numbers.a}
            />
        </div>

        <div>
            <label for="b">Number b:</label>
            <input 
                id="b"
                type="number"
                bind:value={numbers.b}
            />
        </div>

        <div>
            <label for="c">Number c:</label>
            <input 
                id="c"
                type="number"
                bind:value={numbers.c}
            />
        </div>

        <div>
            <p>Current values:</p>
            <ul>
                <li>a: {numbers.a}</li>
                <li>b: {numbers.b}</li>
                <li>c: {numbers.c}</li>
            </ul>
        </div>
    {/if}
</div>
