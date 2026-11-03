import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({
				// English blurb and tags shown under Recent Notes on the top page
				// (src/plugins/remark-recent-notes.mjs).
				summary: z.string().optional(),
				tags: z.array(z.string()).optional(),
			}),
		}),
	}),
};
