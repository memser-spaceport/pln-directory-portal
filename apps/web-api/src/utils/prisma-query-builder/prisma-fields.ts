type PrismaFieldOptions = {
  _type?: 'string' | 'boolean' | 'number';
  _many?: boolean;
  _nullable?: boolean;

  // TODO: As a future idea, implement an alias field name capability:
  // _field?: string;
};

export type PrismaQueryableFields = {
  [queryField: string]: PrismaQueryableFields | PrismaFieldOptions | boolean;
};
