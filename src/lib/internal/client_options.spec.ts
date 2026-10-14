import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ dev: true }));
vi.mock('esm-env', () => ({
	get DEV() {
		return env.dev;
	}
}));

import { differingOptions, warnIgnoredOptions, withServerDisabled } from './client_options.js';

/** Run with or without a `document`, i.e. as in the browser or on the server. */
function inBrowser(browser: boolean) {
	if (browser) globalThis.document = {} as Document;
	else delete (globalThis as { document?: Document }).document;
}

afterEach(() => {
	env.dev = true;
	delete (globalThis as { document?: Document }).document;
	vi.restoreAllMocks();
});

describe('withServerDisabled', () => {
	it('always disables the client on the server, even with disabled: false', () => {
		inBrowser(false);

		expect(withServerDisabled({})).toEqual({ disabled: true });
		expect(withServerDisabled({ disabled: false, verbose: true })).toEqual({
			disabled: true,
			verbose: true
		});
	});

	it('enables the client in the browser unless disabled: true is passed', () => {
		inBrowser(true);

		expect(withServerDisabled({})).toEqual({ disabled: false });
		expect(withServerDisabled({ disabled: true })).toEqual({ disabled: true });
	});
});

describe('differingOptions', () => {
	it('reports primitive options that differ from the creation options', () => {
		expect(differingOptions({ verbose: true }, { verbose: true, expectAuth: true })).toEqual([
			'expectAuth'
		]);
		expect(differingOptions({ expectAuth: true }, { expectAuth: false })).toEqual(['expectAuth']);
	});

	it('ignores disabled, functions and objects (new identity on every hot reload)', () => {
		expect(
			differingOptions(
				{},
				{
					disabled: false,
					logger: { logVerbose() {} } as never,
					webSocketConstructor: class {} as never
				}
			)
		).toEqual([]);
	});
});

describe('warnIgnoredOptions', () => {
	it('warns in the browser during development, naming the ignored options', () => {
		inBrowser(true);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		warnIgnoredOptions('setupConvex', {}, { expectAuth: true });

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain('setupConvex(): ');
		expect(warn.mock.calls[0][0]).toContain('ignored: expectAuth');
	});

	it('stays quiet for matching options, on the server, and in production', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		inBrowser(true);
		warnIgnoredOptions('initConvex', { expectAuth: true }, { expectAuth: true });
		warnIgnoredOptions('initConvex', { expectAuth: true }, {});

		inBrowser(false);
		warnIgnoredOptions('initConvex', {}, { expectAuth: true });

		inBrowser(true);
		env.dev = false;
		warnIgnoredOptions('initConvex', {}, { expectAuth: true });

		expect(warn).not.toHaveBeenCalled();
	});
});
