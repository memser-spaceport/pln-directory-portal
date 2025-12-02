import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

const ContactSupportRequestSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  email: z.string().email().optional(),
  name: z.string().optional(),
  message: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ContactSupportResponseSchema = z.object({
  success: z.boolean(),
  uid: z.string(),
});

export class ContactSupportRequestDto extends createZodDto(ContactSupportRequestSchema) {}
export class ContactSupportResponseDto extends createZodDto(ContactSupportResponseSchema) {}
