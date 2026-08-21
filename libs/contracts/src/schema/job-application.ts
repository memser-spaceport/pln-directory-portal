import { z } from 'zod';

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
