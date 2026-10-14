import { convexLoadHydration } from '$lib/sveltekit/hydration-server.js';

// Serves the endpoint that convexLoad({ fetch }) in universal loads queries
// through, so SvelteKit replays the server's results during hydration instead
// of the loads querying again. This demo has no server-side auth; an app with
// auth puts it after the auth handle: sequence(convexAuth, convexLoadHydration).
export const handle = convexLoadHydration;
