import { ConvexError, v } from 'convex/values';
import { query, mutation, internalMutation } from './_generated/server.js';
import type { Doc } from './_generated/dataModel.js';

export const error = query(() => {
	throw new ConvexError('this is a Convex error');
});

export const list = query(async (ctx, { muteWords = [] }: { muteWords?: string[] }) => {
	const messages = await ctx.db.query('messages').collect();
	const filteredMessages = messages.filter(
		({ body }) => !muteWords.some((word) => body.toLowerCase().includes(word.toLowerCase()))
	);
	return filteredMessages.reverse();
});

export const send = mutation({
	args: { body: v.string(), author: v.string() },
	handler: async (ctx, { body, author }) => {
		const message = { body, author };
		await ctx.db.insert('messages', message);
	}
});

export const firstMessage = query({
	args: {
		fail: v.boolean()
	},
	handler: async (ctx, args) => {
		if (args.fail) {
			console.log('fail', args.fail);
			throw new Error('test error');
		}
		return ctx.db.query('messages').first();
	}
});

import seedMessages from './seed_messages.js';
export const seed = internalMutation({
	handler: async (ctx) => {
		if ((await ctx.db.query('messages').collect()).length >= seedMessages.length) return;

		for (const message of seedMessages as Doc<'messages'>[]) {
			const { _id, _creationTime, ...withoutSystemFields } = message;
			console.log('ignoring', _id, _creationTime);
			await ctx.db.insert('messages', withoutSystemFields);
		}
	}
});
