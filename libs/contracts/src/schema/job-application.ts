import { z } from 'zod';
import { JobSearchStatusWireSchema } from './job-search-status';

export const CreateJobApplicationSchema = z.object({
  coverLetter: z.string().trim().min(1).max(2000),
});

export type CreateJobApplicationInput = z.infer<typeof CreateJobApplicationSchema>;

export const JobApplicationResponseSchema = z.object({
  uid: z.string(),
  jobUid: z.string(),
  appliedAt: z.string(),
});

export const JobApplicationListResponseSchema = z.object({
  applications: z.array(JobApplicationResponseSchema),
});

const JobBoardSignUpTeamSchema = z.object({
  uid: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  website: z.string().min(1).max(500).optional(),
});

export const JobBoardSignUpSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email(),
    /* The address at the company named in `team` — evidence for that claim, so
       the PL team reviewing the account can see where the person works. Never a
       second identity: `email` above is the one address the account is created
       on. Optional independently of `team`, because the company select is
       optional too and an answer given without one is still an answer. */
    teamEmail: z.string().trim().email().max(200).optional(),
    /* Where they are with job hunting. The other half of the board's
       `isProfileComplete` (`role && jobSearchStatus`) — asking it here is what
       lets an account created from this form come back from sign-in ready to
       apply, instead of owing one radio button and paying a whole step for it.

       Imported rather than restated: this list has to match the `JobSearchStatus`
       Prisma enum, and `admin-member.ts` already keeps two hand-written copies of
       it. A third would be a third chance to drift. */
    jobSearchStatus: JobSearchStatusWireSchema.optional(),
    linkedinHandler: z.string().trim().min(1).max(200).optional(),
    role: z.string().trim().min(1).max(200),
    isTeamNew: z.boolean().optional(),
    team: JobBoardSignUpTeamSchema.optional(),
  })
  .superRefine((body, ctx) => {
    if (body.isTeamNew) {
      if (!body.team?.name?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'team.name is required when isTeamNew is true',
          path: ['team', 'name'],
        });
      }
      return;
    }
    if (body.team && !body.team.uid && !body.team.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'team.uid or team.name is required for an existing company',
        path: ['team'],
      });
    }
  });

export type JobBoardSignUpInput = z.infer<typeof JobBoardSignUpSchema>;

export const JobBoardSignUpResponseSchema = z.object({
  uid: z.string(),
});
