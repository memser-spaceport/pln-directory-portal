import { z } from 'zod';
export const ExperienceSchema = z.object({
    companyName: z.string(),
    logoUid: z.string().optional(), 
    title: z.string(),    
    currentTeam: z.boolean(),
    startDate: z.string(),
    endDate: z.string().optional(),
    description: z.string().optional(),    
    memberUid: z.string().optional()
}).superRefine((data, ctx) => {
  if(!data.currentTeam && !data.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date should not be null for past experience',
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

  if(data.startDate  && new Date(data.startDate).getTime() > Date.now() ){
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
