import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	messages: defineTable({
		author: v.string(),
		body: v.string()
	}),
	numbers: defineTable({
		a: v.number(),
		b: v.number(),
		c: v.number()
	})
});
