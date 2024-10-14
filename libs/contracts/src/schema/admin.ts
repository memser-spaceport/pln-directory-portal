import { createZodDto } from 'nestjs-zod';
import { z } from 'nestjs-zod/z';

export class LoginRequestDto extends createZodDto(z.object({
    username: z.string(),
    password: z.string()
})) {};
