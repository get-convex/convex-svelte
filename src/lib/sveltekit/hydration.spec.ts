import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Tests for the convexLoad SSR hydration payload (hydration.ts).
//
// The server embeds convexLoad results of universal loads in the HTML; loads
// re-running during the initial hydration reuse them instead of querying the
// not-yet-authenticated client. Covers serialization safety (XSS), exact
// round-tripping of Convex values, and that the payload is only ever used
// for the initial hydration.
// ---------------------------------------------------------------------------

const env = vi.hoisted(() => ({ dev: false }));
vi.mock('esm-env', () => ({
	get DEV() {
		return env.dev;
	},
	BROWSER: false
}));

type Hydration = typeof import('./hydration.js');
type Singleton = typeof import('../internal/singleton.js');

/** Fresh module instances: the singleton's "first flush happened" flag is permanent. */
async function loadModules(): Promise<{ hydration: Hydration; singleton: Singleton }> {
	vi.resetModules();
	const hydration = await import('./hydration.js');
	const singleton = await import('../internal/singleton.js');
	return { hydration, singleton };
}

/** A collector with one recorded result per entry. */
function collectorWith(hydration: Hydration, entries: Record<string, unknown>) {
	const collector: import('./hydration.js').HydrationCollector = new Map();
	hydration._setHydrationCollectorGetter(() => collector);
	for (const [key, value] of Object.entries(entries)) {
		hydration.recordForHydration(key, value);
	}
	return collector;
}

/** The JSON text inside the `<script>` element, as the browser would see it. */
function scriptText(script: string): string {
	const match = script.match(/^<script type="application\/json" data-convex-load>(.*)<\/script>$/s);
	if (!match) throw new Error(`Unexpected payload markup: ${script}`);
	return match[1];
}

/** Simulate the browser document containing (or not) the payload element. */
function installDocument(text: string | null) {
	const element = text === null ? null : { textContent: text, remove: vi.fn() };
	globalThis.document = {
		querySelector: vi.fn(() => element)
	} as unknown as Document;
	return element;
}

beforeEach(() => {
	env.dev = false;
	delete (globalThis as { document?: Document }).document;
});

afterEach(() => {
	delete (globalThis as { document?: Document }).document;
});

describe('serializeHydrationPayload — server', () => {
	it('emits nothing when nothing was recorded (e.g. ssr = false)', async () => {
		const { hydration } = await loadModules();

		expect(hydration.serializeHydrationPayload(new Map())).toBe('');
	});

	it('cannot be broken out of: no raw "<" inside the script element', async () => {
		const { hydration } = await loadModules();
		const collector = collectorWith(hydration, {
			'messages:list|{}': [
				{ body: '</script><script>alert(1)</script>' },
				{ body: '<!-- <script>' },
				{ body: 'line\u2028separator\u2029' }
			]
		});

		const script = hydration.serializeHydrationPayload(collector);
		const text = scriptText(script);

		expect(text).not.toContain('<');
		expect(text).not.toContain('\u2028');
		expect(text).not.toContain('\u2029');
		// Only the element's own closing tag.
		expect(script.match(/<\/script/g)).toHaveLength(1);
	});

	it('does not record undefined results or record outside a request scope', async () => {
		const { hydration } = await loadModules();
		expect(() => hydration.recordForHydration('a|{}', 'x')).not.toThrow();

		const collector = collectorWith(hydration, { 'a|{}': undefined });

		expect(collector.size).toBe(0);
	});
});

describe('takeHydratedValue — browser', () => {
	it('round-trips Convex values exactly (int64, bytes, nested, null)', async () => {
		const { hydration } = await loadModules();
		const bytes = new Uint8Array([1, 2, 255]).buffer;
		const value = {
			count: 9007199254740993n,
			bytes,
			nested: [{ a: null, b: 1.5, c: 'text' }],
			nothing: null
		};
		installDocument(
			scriptText(hydration.serializeHydrationPayload(collectorWith(hydration, { 'k|{}': value })))
		);

		const taken = hydration.takeHydratedValue('k|{}');

		expect(taken?.value).toEqual(value);
		expect(Array.from(new Uint8Array((taken?.value as { bytes: ArrayBuffer }).bytes))).toEqual([
			1, 2, 255
		]);
	});

	it('returns null results as a hit, and unknown keys as a miss', async () => {
		const { hydration } = await loadModules();
		installDocument(JSON.stringify({ 'k|{}': null }));

		expect(hydration.takeHydratedValue('k|{}')).toEqual({ value: null });
		expect(hydration.takeHydratedValue('other|{}')).toBeUndefined();
	});

	it('serves the same key to several loads (e.g. layout and page)', async () => {
		const { hydration } = await loadModules();
		installDocument(JSON.stringify({ 'k|{}': 1 }));

		expect(hydration.takeHydratedValue('k|{}')).toEqual({ value: 1 });
		expect(hydration.takeHydratedValue('k|{}')).toEqual({ value: 1 });
	});

	it('reads the element once and removes it from the document', async () => {
		const { hydration } = await loadModules();
		const element = installDocument(JSON.stringify({ 'k|{}': 1 }));

		hydration.takeHydratedValue('k|{}');
		hydration.takeHydratedValue('k|{}');

		expect(document.querySelector).toHaveBeenCalledOnce();
		expect(element?.remove).toHaveBeenCalledOnce();
	});

	it('is a miss when the page has no payload (handle not installed, no SSR)', async () => {
		const { hydration } = await loadModules();
		installDocument(null);

		expect(hydration.takeHydratedValue('k|{}')).toBeUndefined();
	});

	it('is a miss (not a crash) for a malformed payload', async () => {
		const { hydration } = await loadModules();
		installDocument('{not json');

		expect(hydration.takeHydratedValue('k|{}')).toBeUndefined();
	});

	it('is a miss (not a crash) for a value that is not valid Convex JSON, and warns once in dev', async () => {
		env.dev = true;
		const { hydration } = await loadModules();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		installDocument(JSON.stringify({ 'a|{}': { $integer: 5 }, 'b|{}': { $bytes: 7 } }));

		expect(hydration.takeHydratedValue('a|{}')).toBeUndefined();
		expect(hydration.takeHydratedValue('b|{}')).toBeUndefined();

		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it('is never used after setupConvex / setupAuth flushed (client-side navigation)', async () => {
		const { hydration, singleton } = await loadModules();
		installDocument(JSON.stringify({ 'k|{}': 1 }));

		singleton.flushDeferredSubscriptions();

		expect(hydration.takeHydratedValue('k|{}')).toBeUndefined();
	});

	it('stays unused after closeConvex() re-opens the deferred queue', async () => {
		const { hydration, singleton } = await loadModules();
		installDocument(JSON.stringify({ 'k|{}': 1 }));
		singleton.flushDeferredSubscriptions();

		await singleton.closeConvex();

		expect(singleton.isInitialHydration()).toBe(false);
		expect(hydration.takeHydratedValue('k|{}')).toBeUndefined();
	});
});

describe('warnHydrationMiss — browser, dev only', () => {
	it('warns when the server embedded results but a hydration load found none', async () => {
		env.dev = true;
		const { hydration } = await loadModules();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		installDocument(JSON.stringify({ 'other|{}': 1 }));
		hydration.takeHydratedValue('k|{}');

		hydration.warnHydrationMiss('messages:list');

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain('messages:list');
		warn.mockRestore();
	});

	it('stays quiet without embedded results (no handle, ssr = false), in production, or after hydration', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		env.dev = true;
		let { hydration } = await loadModules();
		installDocument(null);
		hydration.takeHydratedValue('k|{}');
		hydration.warnHydrationMiss('no-handle');

		env.dev = false;
		({ hydration } = await loadModules());
		installDocument('{}');
		hydration.takeHydratedValue('k|{}');
		hydration.warnHydrationMiss('production');

		env.dev = true;
		const modules = await loadModules();
		installDocument('{}');
		modules.hydration.takeHydratedValue('k|{}');
		modules.singleton.flushDeferredSubscriptions();
		modules.hydration.warnHydrationMiss('after-hydration');

		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
