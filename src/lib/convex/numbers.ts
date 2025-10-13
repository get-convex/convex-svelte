import { v } from 'convex/values';
import { query, mutation } from './_generated/server.js';

export const get = query(async (ctx) => {
	const numbers = await ctx.db.query('numbers').first();
	return {
		a: numbers?.a || 0,
		b: numbers?.b || 0,
		c: numbers?.c || 0
	};
});

export const update = mutation({
	args: {
		a: v.number(),
		b: v.number(),
		c: v.number()
	},
	handler: async (ctx, { a, b, c }) => {
		const existing = await ctx.db.query('numbers').first();
		let id = existing?._id;
		if (!id) {
			id = await ctx.db.insert('numbers', { a: 0, b: 0, c: 0 });
		}
		await ctx.db.replace(id, { a, b, c });
	}
});
