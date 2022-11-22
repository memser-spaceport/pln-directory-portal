import zodToJsonSchema from 'zod-to-json-schema';
import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';

/**
 * This is just syntax sugar to apply the swagger
 * decorator using a zod-to-json schema with minimal effort:
 */
export const ApiOkResponseFromZod = (ZodSchema: any) => {
  return applyDecorators(
    ApiOkResponse({
      schema: zodToJsonSchema(ZodSchema, { target: 'openApi3' }),
    })
  );
};
