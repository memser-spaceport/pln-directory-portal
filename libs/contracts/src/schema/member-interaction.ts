import { z,  } from "zod";
import { createZodDto } from '@abitia/zod-dto';

export const MemberInteractionType = z.enum([
  "SCHEDULE_MEETING"
]);

const MemberInteractionSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  type: MemberInteractionType,
  data: z.any().optional(),
  hasFollowUp: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sourceMemberUid: z.string(),
  targetMemberUid: z.string().optional(),
});

export const CreateMemberInteractionSchema = MemberInteractionSchema.pick({
  type: true,
  data: true,
  targetMemberUid: true
});

export const ResponseMemberInteractionSchema = MemberInteractionSchema.omit({ id: true }).strict();

export class CreateMemberInteractionSchemaDto extends createZodDto(CreateMemberInteractionSchema) {}
