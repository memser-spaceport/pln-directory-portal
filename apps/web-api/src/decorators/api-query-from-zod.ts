import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

/**
 * This decorator maps the zod-to-json schema into
 * the swagger decorator API since we're not able to just
 * pass a schema because it does not work well with complex json schemas. 🤷‍♂️
 */
export const ApiQueryFromZod = (
  ZodQueryParams: z.ZodOptional<z.ZodObject<any>>
) => {
  const zodSchema = zodToJsonSchema(ZodQueryParams.unwrap(), {
    $refStrategy: 'none',
  }) as any;

  return applyDecorators(
    ...Object.entries(zodSchema.properties).map(
      ([queryKey, queryOptions]: [string, any]) => {
        // Treat arrays as a multiple valued string
        const queryValueType =
          queryOptions.type == 'array' ? 'string' : queryOptions.type;
        return ApiQuery({
          name: queryKey,
          type: queryValueType,
          enum: queryOptions?.enum || queryOptions?.items?.enum,
          required: false,
          allowEmptyValue: false,
        });
      }
    )
  );
};
