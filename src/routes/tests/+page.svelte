<script lang="ts">
	import { resolve } from '$app/paths';

	const categories = [
		{
			name: 'Queries',
			color: 'purple',
			routes: [
				{
					title: 'Always Errors',
					path: '/tests/always-errors',
					description: 'Tests error handling for queries that always throw'
				},
				{
					title: 'Skip Query',
					path: '/tests/skip-query',
					description: 'Tests conditional query skipping behavior'
				},
				{
					title: 'Keep Previous Data',
					path: '/tests/keep-previous-data',
					description: 'Tests keepPreviousData option for useQuery'
				}
			]
		},
		{
			name: 'Paginated Queries',
			color: 'blue',
			routes: [
				{
					title: 'Paginated Query',
					path: '/tests/paginated-query',
					description: 'Tests paginated query loading and pagination controls'
				},
				{
					title: 'Paginated Query No SSR',
					path: '/tests/paginated-query-no-ssr',
					description: 'Tests paginated query without server-side rendering'
				}
			]
		},
		{
			name: 'Mutations',
			color: 'green',
			routes: [
				{
					title: 'Mutation',
					path: '/tests/mutation',
					description: 'Tests calling mutations and reactive query updates'
				},
				{
					title: 'Optimistic Update',
					path: '/tests/optimistic-update',
					description: 'Tests optimistic updates with mutations'
				},
				{
					title: 'useMutation / useAction',
					path: '/tests/use-mutation-action',
					description: 'Tests useMutation and useAction wrapper functions'
				}
			]
		},
		{
			name: 'Authentication',
			color: 'amber',
			routes: [
				{
					title: 'Auth',
					path: '/tests/auth',
					description: 'Tests authentication state management'
				},
				{
					title: 'Auth Clear',
					path: '/tests/auth-clear',
					description: 'Tests clearing authentication state'
				},
				{
					title: 'Auth No Setup',
					path: '/tests/auth-no-setup',
					description: 'Tests auth behavior without prior setup'
				},
				{
					title: 'Auth SSR',
					path: '/tests/auth-ssr',
					description: 'Tests authentication with server-side rendering'
				}
			]
		},
		{
			name: 'SSR & SvelteKit',
			color: 'rose',
			routes: [
				{
					title: 'ConvexLoad (SSR Transport)',
					path: '/tests/convex-load',
					description: 'Tests SSR transport with live upgrade via convexLoad'
				},
				{
					title: 'ConvexLoadPaginated (SSR Transport)',
					path: '/tests/convex-load-paginated',
					description: 'Tests SSR transport with live paginated upgrade via convexLoadPaginated'
				},
				{
					title: 'ConvexHttpClient (Server)',
					path: '/tests/convex-http-client',
					description: 'Tests server-side data fetching with createConvexHttpClient'
				},
				{
					title: 'SvelteKit Singleton',
					path: '/tests/sveltekit-singleton',
					description: 'Tests SvelteKit singleton pattern for Convex client'
				},
				{
					title: 'getConvexClient',
					path: '/tests/get-convex-client',
					description: 'Tests calling mutations from a plain .ts utility file'
				}
			]
		}
	] as const;

	const colorMap: Record<
		string,
		{ dot: string; border: string; hoverBorder: string; tag: string }
	> = {
		purple: {
			dot: 'bg-purple-500',
			border: 'border-purple-200',
			hoverBorder: 'hover:border-purple-400',
			tag: 'text-purple-600'
		},
		blue: {
			dot: 'bg-blue-500',
			border: 'border-blue-200',
			hoverBorder: 'hover:border-blue-400',
			tag: 'text-blue-600'
		},
		green: {
			dot: 'bg-green-500',
			border: 'border-green-200',
			hoverBorder: 'hover:border-green-400',
			tag: 'text-green-600'
		},
		amber: {
			dot: 'bg-amber-500',
			border: 'border-amber-200',
			hoverBorder: 'hover:border-amber-400',
			tag: 'text-amber-600'
		},
		rose: {
			dot: 'bg-rose-500',
			border: 'border-rose-200',
			hoverBorder: 'hover:border-rose-400',
			tag: 'text-rose-600'
		}
	};
</script>

<svelte:head>
	<title>Tests</title>
</svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-2 text-3xl font-bold text-gray-900">Tests</h1>
	<p class="mb-8 text-gray-600">All available test routes for convex-svelte</p>

	{#each categories as category (category.name)}
		{@const colors = colorMap[category.color]}
		<section class="mb-10">
			<h2 class="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-800">
				<span class="h-2 w-2 rounded-full {colors.dot}"></span>
				{category.name}
			</h2>
			<div class="space-y-3">
				{#each category.routes as route (route.path)}
					<a
						href={resolve(route.path)}
						class="block rounded-lg border {colors.border} bg-white p-4 shadow transition-shadow {colors.hoverBorder} hover:shadow-md"
					>
						<h3 class="text-lg font-semibold text-gray-900">{route.title}</h3>
						<p class="mt-1 text-sm text-gray-600">{route.description}</p>
						<span class="mt-2 inline-block text-xs {colors.tag}">{route.path}</span>
					</a>
				{/each}
			</div>
		</section>
	{/each}

	<section class="rounded-lg border border-gray-200 bg-gray-100 p-4">
		<h3 class="mb-2 font-semibold text-gray-900">Run E2E Tests</h3>
		<p class="text-sm text-gray-600">
			Execute <code class="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-xs">pnpm test:e2e</code> to
			run all test scenarios with Playwright.
		</p>
	</section>
</div>
