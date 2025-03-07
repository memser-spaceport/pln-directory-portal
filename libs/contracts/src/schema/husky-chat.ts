import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const HuskyChatSchema = z.object({
  question: z.string(),
  name: z.string().optional(),
  chatSummary: z.object({
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
  }).optional(),
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

export const HuskyResponseSchema = z.object({
  content: z.string(),
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

export type HuskyChatInterface = z.infer<typeof HuskyChatSchema>;
export class HuskyChatDto extends createZodDto(HuskyChatSchema) {}
export class HuskyFeedbackDto extends createZodDto(HuskyFeedbackSchema) {}
