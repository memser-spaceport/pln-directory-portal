import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/**
 * Body posted by the agent to `POST /v1/ai-apps/connect/poll` to check whether
 * its connect session has been approved yet. The `pollToken` (returned when the
 * session was started) proves the caller is the same agent and is required to
 * collect the issued deploy token.
 */
export const PollConnectSchema = z.object({
  pollToken: z.string().min(1).max(200),
});

export class PollConnectDto extends createZodDto(PollConnectSchema) {}
