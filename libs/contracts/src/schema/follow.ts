import { z } from 'zod';

/**
 * Follow feature shared schemas.
 *
 * The persisted edge is polymorphic (see the `Follow` Prisma model): a member
 * follows an entity identified by `entityType` + `entityUid`. Today only teams
 * are followable; member-follows-member can be added later without reshaping
 * these contracts (add `MEMBER` handling alongside `TEAM`).
 */
export const FollowEntityTypeSchema = z.enum(['TEAM', 'MEMBER']);
export type FollowEntityType = z.infer<typeof FollowEntityTypeSchema>;

const PaginationQuery = {
  page: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1))
    .optional()
    .default(1),
  limit: z
    .preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(200))
    .optional()
    .default(50),
};

export const FollowedTeamsQueryParams = z.object({ ...PaginationQuery });
export type FollowedTeamsQuery = z.infer<typeof FollowedTeamsQueryParams>;

export const TeamFollowersQueryParams = z.object({ ...PaginationQuery });
export type TeamFollowersQuery = z.infer<typeof TeamFollowersQueryParams>;

// Response of follow / unfollow mutations. `following` reflects the resulting
// state, so the client can toggle UI off a single field. Idempotent: following
// an already-followed team (or unfollowing one not followed) is a success.
export const FollowStatusResponseSchema = z.object({
  following: z.boolean(),
  entityType: FollowEntityTypeSchema,
  entityUid: z.string(),
  followerCount: z.number().int().min(0),
});
export type FollowStatusResponse = z.infer<typeof FollowStatusResponseSchema>;

// One team in the "teams I follow" list.
export const FollowedTeamSchema = z.object({
  uid: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  followedAt: z.string(),
  followerCount: z.number().int().min(0),
});
export type FollowedTeam = z.infer<typeof FollowedTeamSchema>;

export const FollowedTeamsResponseSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(FollowedTeamSchema),
});
export type FollowedTeamsResponse = z.infer<typeof FollowedTeamsResponseSchema>;

// One follower in a team's followers list.
export const TeamFollowerSchema = z.object({
  uid: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  followedAt: z.string(),
});
export type TeamFollower = z.infer<typeof TeamFollowerSchema>;

export const TeamFollowersResponseSchema = z.object({
  teamUid: z.string(),
  teamName: z.string(),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(TeamFollowerSchema),
});
export type TeamFollowersResponse = z.infer<typeof TeamFollowersResponseSchema>;
