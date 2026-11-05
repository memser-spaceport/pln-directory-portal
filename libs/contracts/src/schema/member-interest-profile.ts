import { z } from 'zod';

/** Admin read of member interest profiles (LAB-3122). */
const intParam = (min: number, max: number, fallback: number) =>
  z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(min).max(max))
    .optional()
    .default(fallback);

export const MemberInterestProfilesQuerySchema = z.object({
  /** Comma-separated member uids, at most 100. */
  memberUids: z
    .string()
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((uid) => uid.trim())
          .filter(Boolean)
      ),
    ])
    .refine((uids) => uids.length > 0, 'memberUids must name at least one member')
    .refine((uids) => uids.length <= 100, 'memberUids accepts at most 100 members'),
  top: intParam(1, 50, 5),
  page: intParam(1, 10_000, 1),
  limit: intParam(1, 100, 20),
});
export type MemberInterestProfilesQuery = z.infer<typeof MemberInterestProfilesQuerySchema>;

const ScoredSlug = z.object({ slug: z.string(), score: z.number() });

export const MemberInterestProfileItemSchema = z.object({
  memberUid: z.string(),
  name: z.string().nullable(),
  topics: z.array(ScoredSlug),
  entities: z.array(z.object({ type: z.string(), uid: z.string(), name: z.string().nullable(), score: z.number() })),
  expertise: z.array(ScoredSlug),
});

export const MemberInterestProfilesResponseSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  items: z.array(MemberInterestProfileItemSchema),
});
export type MemberInterestProfilesResponse = z.infer<typeof MemberInterestProfilesResponseSchema>;
