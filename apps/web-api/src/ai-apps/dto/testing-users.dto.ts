import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { AI_APPS_TESTING_USERS_MAX_PER_APP, AI_APPS_TESTING_USERS_PAGE_LIMIT } from '../ai-apps.constants';

/** Body of `POST /v1/ai-apps/:uid/testing-users`: how many testing users to create (1 to 100). */
export const CreateAiAppTestingUsersSchema = z.object({
  count: z.number().int().min(1).max(AI_APPS_TESTING_USERS_MAX_PER_APP),
});

export class CreateAiAppTestingUsersDto extends createZodDto(CreateAiAppTestingUsersSchema) {}

/** Body of `POST /v1/ai-apps/:uid/testing-users/sessions`. Omitted `uids` mints every active testing user. */
export const MintAiAppTestingSessionsSchema = z.object({
  uids: z.array(z.string().min(1).max(64)).min(1).max(AI_APPS_TESTING_USERS_MAX_PER_APP).optional(),
});

export class MintAiAppTestingSessionsDto extends createZodDto(MintAiAppTestingSessionsSchema) {}

const positiveIntString = (max?: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, 'must be a positive integer')
    .transform(Number)
    .refine((value) => max === undefined || value <= max, `must be at most ${max}`);

/** Query of `GET /v1/ai-apps/:uid/testing-users`: `page` (from 1) and `limit` (at most 100). */
export const ListAiAppTestingUsersQuerySchema = z.object({
  page: positiveIntString().optional(),
  limit: positiveIntString(AI_APPS_TESTING_USERS_PAGE_LIMIT).optional(),
});

export class ListAiAppTestingUsersQueryDto extends createZodDto(ListAiAppTestingUsersQuerySchema) {}
