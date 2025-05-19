import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { applyDecorators } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';

/**
 * This decorator maps the zod schema into
 * the swagger decorator API for request bodies.
 * It converts the zod schema to a JSON schema that Swagger can understand.
 */
export const ApiBodyFromZod = (ZodSchema: z.ZodType<any>) => {
  return applyDecorators(
    ApiBody({
      schema: zodToJsonSchema(ZodSchema, {
        target: 'openApi3',
        $refStrategy: 'none',
      }),
    })
  );
};
