import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const RequestMembersSchema = z.object({
  accessLevel: z
    .string()
    .transform((val) => val.split(',').map((v) => v.trim()))
    .refine((arr) => arr.length > 0, { message: 'accessLevel must contain at least one value' }),
  page: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional()
    .default('1'),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional()
    .default('20'),
});

export const UpdateAccessLevelSchema = z.object({
  memberUids: z
    .string()
    .array()
    .nonempty({ message: 'memberUids cannot be empty' }),
  accessLevel: z
    .string()
    .min(1, { message: 'accessLevel must not be empty' }),
});

export class RequestMembersDto extends createZodDto(RequestMembersSchema) {}
export class UpdateAccessLevelDto extends createZodDto(UpdateAccessLevelSchema) {}
