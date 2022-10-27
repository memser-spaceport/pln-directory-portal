import { PrismaQueryableFields } from '../prisma-fields';
import { PrismaQuery } from '../prisma-query';
import { LookupFilter } from './field/lookup.enum';

export abstract class AbstractFilter {
  public readonly prop: string;
  public readonly lookup: LookupFilter;
  public readonly value: string;
  public readonly fields: PrismaQueryableFields;
  public query: PrismaQuery;

  constructor(
    query: PrismaQuery,
    prop: string,
    lookup: LookupFilter,
    value: string,
    fields: PrismaQueryableFields
  ) {
    this.query = query;
    this.prop = prop;
    this.lookup = lookup;
    this.value = value;
    this.fields = fields;
  }

  public abstract buildQuery(): void;
}
