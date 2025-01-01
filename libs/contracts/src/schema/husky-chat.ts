import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const HuskyChatSchema = z.object({
  uid: z.string(),
  question: z.string(),
  email: z.string().email(),
  name: z.string(),
  directoryId: z.string(),
  source: z.string(),
});

export const HuskyFeedbackSchema = z.object({ 
  prompt: z.string(),
  response: z.string(),
  rating: z.number(),
  comment: z.string(),
  name: z.string(),
  team: z.string(),
  directoryId: z.string(),
  email: z.string().email(),
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

export class HuskyChatDto extends createZodDto(HuskyChatSchema) {}
export class HuskyFeedbackDto extends createZodDto(HuskyFeedbackSchema) {}
