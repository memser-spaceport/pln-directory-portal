import { z } from 'zod';

export const PL_INFRA_MEMBERS_DEFAULT_LIMIT = 500;
export const PL_INFRA_MEMBERS_MAX_LIMIT = 1000;

const toNumber = (value: unknown) => (value === undefined || value === '' ? undefined : Number(value));

export const PlInfraMembersQuerySchema = z.object({
  page: z.preprocess(toNumber, z.number().int().min(1).default(1)),
  limit: z.preprocess(
    toNumber,
    z.number().int().min(1).max(PL_INFRA_MEMBERS_MAX_LIMIT).default(PL_INFRA_MEMBERS_DEFAULT_LIMIT)
  ),
});

export const PlInfraMemberSchema = z.object({
  memberUid: z.string(),
  name: z.string().nullable(),
});

export const PlInfraMembersResponseSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(PlInfraMemberSchema),
});

export type PlInfraMembersQuery = z.infer<typeof PlInfraMembersQuerySchema>;
export type PlInfraMember = z.infer<typeof PlInfraMemberSchema>;
export type PlInfraMembersResponse = z.infer<typeof PlInfraMembersResponseSchema>;
