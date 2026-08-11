import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

// The orchestrator itself rejects an empty message; mirroring the constraint here
// keeps the 400 local instead of spending a round trip to learn the same thing.
// The 20k ceiling matches CreateAgentSessionSchema.prompt — a message is just a
// follow-up prompt, so the same budget applies.
export const SendAgentSessionMessageSchema = z.object({
  message: z.string().min(1).max(20_000),
});

export class SendAgentSessionMessageDto extends createZodDto(SendAgentSessionMessageSchema) {}
