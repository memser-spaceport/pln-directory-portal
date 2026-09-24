import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const HuskyChatSchema = z.object({
  question: z.string(),
  name: z.string().optional(),
  chatSummary: z
    .object({
      user: z.string(),
      system: z.string(),
      sources: z.array(z.string()),
      followUpQuestions: z.array(z.string()),
      actions: z.array(
        z.object({
          name: z.string(),
          directoryLink: z.string(),
          type: z.string(),
        })
      ),
      threadId: z.string(),
      chatId: z.string(),
    })
    .optional(),
  threadId: z.string(),
  chatId: z.string(),
});

export const HuskyFeedbackSchema = z.object({
  prompt: z.string(),
  response: z.string(),
  rating: z.number(),
  comment: z.string(),
  name: z.string().optional(),
  team: z.string().optional(),
  directoryId: z.string().optional(),
  email: z.string().email().optional(),
});

export const HuskySourceRefSchema = z.object({
  index: z.number().int().positive(),
  title: z.string(),
  type: z.enum(['team', 'member', 'news', 'job', 'project', 'event', 'forum', 'external']),
  directoryLink: z.string().optional(),
  externalUrl: z.string().optional(),
});

export type HuskySourceRef = z.infer<typeof HuskySourceRefSchema>;

/** Passed to streamObject. sourceRefs are built in code and are not part of this schema. */
export const HuskyResponseContextSchema = z.object({
  followUpQuestions: z.array(z.string()),
  sources: z.array(z.string()),
  actions: z.array(
    z.object({
      name: z.string(),
      directoryLink: z.string(),
      type: z.string(),
    })
  ),
});

export const HuskyResponseSchema = z.object({
  content: z.string(),
  followUpQuestions: z.array(z.string()),
  sources: z.array(z.string()),
  sourceRefs: z.array(HuskySourceRefSchema).optional(),
  actions: z.array(
    z.object({
      name: z.string(),
      directoryLink: z.string(),
      type: z.string(),
    })
  ),
});

export type HuskyChatInterface = z.infer<typeof HuskyChatSchema>;
export class HuskyChatDto extends createZodDto(HuskyChatSchema) {}
export class HuskyFeedbackDto extends createZodDto(HuskyFeedbackSchema) {}
