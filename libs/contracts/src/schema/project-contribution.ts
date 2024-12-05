import { z } from 'zod';
import { compareDateWithoutTime, compareMonthYear } from '../../src/utils/date-utils';

const ProjectContribution = z.object({
  role: z.string().nullish(),
  currentProject: z.boolean().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  description: z.string().nullish(),
  projectUid: z.string(),
  uid: z.string().nullish()
});

export const ProjectContributionSchema = ProjectContribution.superRefine((data, ctx) => {
  if (data.startDate && data.endDate && compareDateWithoutTime(data.startDate, data.endDate) >= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date should be greater than start date',
      fatal: true,
    });
  }

  if (data.startDate && compareDateWithoutTime(data.startDate, new Date().toISOString()) > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Start date should be less than or equal to current date',
      fatal: true,
    });
  }

  if (data.endDate && compareMonthYear(data.endDate, new Date().toISOString()) > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date should be less than or equal to current date',
      fatal: true,
    });
  }

  return z.never();
});

export const ResponseProjectContributionSchema = ProjectContribution.strict();
