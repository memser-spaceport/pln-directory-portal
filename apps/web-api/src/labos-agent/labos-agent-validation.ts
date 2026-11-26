import { BadRequestException } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';
import { LABOS_AGENT_ERROR_CODES } from 'libs/contracts/src/schema/labos-agent';

/** The parsed body (or query), or 400 VALIDATION_ERROR. */
export function validBody<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  body: unknown,
  message = 'Invalid request body'
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      statusCode: 400,
      code: LABOS_AGENT_ERROR_CODES.VALIDATION_ERROR,
      message,
      errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return parsed.data;
}
