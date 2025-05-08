import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
})

export class LoginRequestDto extends createZodDto(CredentialsSchema) {}
