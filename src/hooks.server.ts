import { convexLoadHydration } from '$lib/sveltekit/server-token.js';

// Embed convexLoad results from universal loads in the SSR HTML, so loads that
// re-run during hydration reuse them instead of querying again.
export const handle = convexLoadHydration;
