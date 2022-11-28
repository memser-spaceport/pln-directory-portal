import zodToJsonSchema from 'zod-to-json-schema';
import { PrismaQueryableFields } from './prisma-query-builder/prisma-fields';

/**
 * Helper method to easily convert zod schemas
 * into Prisma Query Builder fields configuration.
 *
 * @param zodSchema
 * @returns PrismaQueryableFields
 */
export const prismaQueryableFieldsFromZod = (
  zodSchema: any
): PrismaQueryableFields => {
  // Generate JSON Schema from Zod schema:
  const jsonSchema = zodToJsonSchema(zodSchema, {
    // Disable schema references as they bring unnecessary complexity:
    $refStrategy: 'none',
  }) as any;

  // Get field options from each property:
  const getQueryableFieldOptions = (properties) => {
    return Object.entries(properties).reduce(
      (allFields, [field, options]: [string, any]) => {
        const type =
          options?.type ||
          options?.anyOf?.find(
            (schema) => 'type' in schema && schema.type !== 'null'
          )?.type ||
          options?.anyOf?.[0]?.anyOf.find((schema) => 'type' in schema)?.type;
        const isNullable =
          'anyOf' in options &&
          options.anyOf.some((any) => any?.type === 'null');
        const isNested = ['object', 'array'].includes(options.type);
        const hasMany = isNested && options.type === 'array';
        const nestedFields = isNested
          ? getQueryableFieldOptions(
              hasMany ? options.items.properties : options.properties
            )
          : {};

        return {
          ...allFields,
          [field]: {
            ...(type && !isNested && { _type: type }),
            ...(isNullable && { _nullable: true }),
            ...(hasMany && { _many: true }),
            ...nestedFields,
          },
        };
      },
      {}
    );
  };

  return getQueryableFieldOptions(jsonSchema.properties);
};
