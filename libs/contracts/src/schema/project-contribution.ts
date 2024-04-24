import { z } from 'zod';

const ProjectContribution = z.object({
  role: z.string(),
  currentProject: z.boolean(),
  startDate: z.string().nullish(),
  endDate: z.string().optional(),
  description: z.string().optional().nullish(),
  projectUid: z.string(),
  uid: z.string().optional()
});

export const ProjectContributionSchema = ProjectContribution.superRefine((data, ctx) => {
  if(!data.currentProject && !data.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date should not be null for past contribution',
      fatal: true,
    });
  }

  if(data.startDate && data.endDate && new Date(data.startDate).getTime() >= new Date(data.endDate).getTime() ){
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date should be greater than start date',
      fatal: true,
    });
  }

  if(data.startDate  && new Date(data.startDate).getTime() >= Date.now() ){
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Start date should be less than or equal to current date',
      fatal: true,
    });
  }

  if(data.endDate  && new Date(data.endDate).getTime() > Date.now() ){
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date should be less than or equal to current date',
      fatal: true,
    });
  }

  return z.never;
});

export const ResponseProjectContributionSchema = ProjectContribution.strict();
