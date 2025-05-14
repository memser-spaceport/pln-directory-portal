import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}

export const VerifyMembersRequestSchema = z.object({
  memberIds: z.array(z.string()),
});

export const UpdateMemberAndVerifyRequestSchema = z.object({});

export class VerifyMembersRequestDto extends createZodDto(VerifyMembersRequestSchema) {}
export class UpdateMemberAndVerifyRequestDto extends createZodDto(UpdateMemberAndVerifyRequestSchema) {}
