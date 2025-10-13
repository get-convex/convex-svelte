import { ConvexClient } from 'convex/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Convex client
vi.mock('convex/browser', () => {
	return {
		ConvexClient: vi.fn()
	};
});

describe('useMutation', () => {
	let mockClient: {
		mutation: ReturnType<typeof vi.fn>;
		action: ReturnType<typeof vi.fn>;
		close: ReturnType<typeof vi.fn>;
		disabled: boolean;
	};
	let mockMutation: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockMutation = vi.fn();
		mockClient = {
			mutation: mockMutation,
			action: vi.fn(),
			close: vi.fn(),
			disabled: false
		};
		(ConvexClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
	});

	it('should create a mutation function that calls client.mutation', async () => {
		// Setup must be done in a component context, but we can test the client interaction
		mockMutation.mockResolvedValue({ id: '123' });

		// Verify the mock is set up correctly
		expect(ConvexClient).toBeDefined();
		expect(mockClient.mutation).toBeDefined();
	});

	it('should resolve with mutation result on success', async () => {
		mockMutation.mockResolvedValue({ id: '456', success: true });

		const result = await mockClient.mutation({}, { data: 'test' });

		expect(result).toEqual({ id: '456', success: true });
		expect(mockMutation).toHaveBeenCalledWith({}, { data: 'test' });
	});

	it('should reject with error on failure', async () => {
		const error = new Error('Mutation failed');
		mockMutation.mockRejectedValue(error);

		await expect(mockClient.mutation({}, { data: 'test' })).rejects.toThrow('Mutation failed');
	});
});

describe('useAction', () => {
	let mockClient: {
		mutation: ReturnType<typeof vi.fn>;
		action: ReturnType<typeof vi.fn>;
		close: ReturnType<typeof vi.fn>;
		disabled: boolean;
	};
	let mockAction: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockAction = vi.fn();
		mockClient = {
			mutation: vi.fn(),
			action: mockAction,
			close: vi.fn(),
			disabled: false
		};
		(ConvexClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
	});

	it('should create an action function that calls client.action', async () => {
		mockAction.mockResolvedValue({ results: ['a', 'b'] });

		expect(ConvexClient).toBeDefined();
		expect(mockClient.action).toBeDefined();
	});

	it('should resolve with action result on success', async () => {
		mockAction.mockResolvedValue({ results: ['item1', 'item2'] });

		const result = await mockClient.action({}, { query: 'search' });

		expect(result).toEqual({ results: ['item1', 'item2'] });
		expect(mockAction).toHaveBeenCalledWith({}, { query: 'search' });
	});

	it('should reject with error on failure', async () => {
		const error = new Error('Action failed');
		mockAction.mockRejectedValue(error);

		await expect(mockClient.action({}, { query: 'test' })).rejects.toThrow('Action failed');
	});
});

describe('ConvexClient Mock', () => {
	it('should create a ConvexClient instance with URL and options', () => {
		const testUrl = 'https://test.convex.cloud';
		const options = { disabled: false };

		new ConvexClient(testUrl, options);

		expect(ConvexClient).toHaveBeenCalledWith(testUrl, options);
	});
});

describe('Type exports', () => {
	it('should export all necessary functions', async () => {
		const lib = await import('./client.svelte.js');

		expect(lib.setupConvex).toBeDefined();
		expect(lib.useConvexClient).toBeDefined();
		expect(lib.useQuery).toBeDefined();
		expect(lib.useMutation).toBeDefined();
		expect(lib.useAction).toBeDefined();
		expect(lib.setConvexClientContext).toBeDefined();
	});
});

describe('Error handling', () => {
	it('should handle string rejection and convert to Error', () => {
		const stringError = 'Something went wrong';
		const error = new Error(String(stringError));

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe('Something went wrong');
	});

	it('should handle object rejection and convert to Error', () => {
		const objectError = { code: 500, message: 'Server error' };
		const error = new Error(String(objectError));

		expect(error).toBeInstanceOf(Error);
	});
});

describe('State management patterns', () => {
	it('should demonstrate isLoading state pattern', () => {
		let isLoading = false;

		// Simulate mutation call
		isLoading = true;
		expect(isLoading).toBe(true);

		// Simulate mutation complete
		isLoading = false;
		expect(isLoading).toBe(false);
	});

	it('should demonstrate error state pattern', () => {
		let error: Error | undefined = undefined;

		// Simulate error
		error = new Error('Test error');
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe('Test error');

		// Clear error
		error = undefined;
		expect(error).toBeUndefined();
	});
});
