import { z } from 'zod';

/**
 * Reusable zod schema for dealing with
 * comma-separated query values against a zod enum
 */
const ZodCommaSeparatedQueryValues = (
  queryableFields: z.ZodEnum<[string, ...string[]]>
) =>
  z
    .preprocess((value) => String(value).split(','), queryableFields.array())
    .transform((arr) => arr.join(','));

/**
 * Helper method to extract the queryable nested
 * fields of each relational field from any zod object
 */
const getQueryableNestedFieldsFromZod = (
  relationalFields: z.ZodObject<z.ZodRawShape>
) => {
  return Object.entries(relationalFields.shape).reduce(
    (allRelationalFields, [relationalField, options]) => {
      const isZodType = (type: string) => options._def.typeName === type;
      // Extract inner schema in optional zod schemas:
      options = isZodType(z.ZodOptional.name)
        ? (options as z.ZodOptional<z.AnyZodObject>).unwrap()
        : options;
      // Grab nested fields either from ZodArray or ZodObject:
      const nestedFields = isZodType(z.ZodArray.name)
        ? ((options as z.ZodArray<z.ZodObject<z.ZodRawShape>>).element.keyof()
            .options as string[])
        : [];
      return nestedFields
        ? [
            ...allRelationalFields,
            ...nestedFields.map(
              (nestedField) => `${relationalField}.${nestedField}`
            ),
          ]
        : allRelationalFields;
    },
    [] as string[]
  );
};

/**
 * Provides the zod schema for the PLN API universal query params
 */
export const QueryParams = ({
  queryableFields,
  relationalFields,
}: {
  queryableFields: z.ZodEnum<[string, ...string[]]>;
  relationalFields?: z.ZodObject<z.ZodRawShape>;
}) =>
  z
    .object({
      pagination: z.boolean().default(true).optional(),
      page: z.number().positive().optional(),
      limit: z.number().positive().optional(),
      select: ZodCommaSeparatedQueryValues(queryableFields).optional(),
      distinct: ZodCommaSeparatedQueryValues(queryableFields).optional(),
      orderBy: ZodCommaSeparatedQueryValues(queryableFields).optional(),

      // Relational Query Params:
      ...(!!relationalFields && {
        with: ZodCommaSeparatedQueryValues(
          // List of relational fields:
          relationalFields.keyof()
        ).optional(),
      }),
      ...(!!relationalFields &&
        getQueryableNestedFieldsFromZod(relationalFields).length && {
          order: ZodCommaSeparatedQueryValues(
            // List of nested fields of each relational field:
            z.enum(
              getQueryableNestedFieldsFromZod(relationalFields) as [string]
            )
          ).optional(),
        }),
    })
    .optional();

export const RETRIEVAL_QUERY_FILTERS: { [prop: string]: true } = {
  order: true,
  with: true,
  select: true,
};
