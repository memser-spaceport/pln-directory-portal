import { QueryString } from './query-string';
import { PrismaQuery } from './prisma-query';
import { FilterFactory } from './filter/filter-factory';
import { OptionsCollection } from './filter/options/container';
import { ConfigProfile } from './profile/config-profile';
import { loadProfile } from './profile/loader';
import { PrismaQueryableFields } from './prisma-fields';

export class PrismaQueryBuilder {
  private readonly profile: ConfigProfile;
  private readonly findOptions: OptionsCollection;
  private readonly filterFactory: FilterFactory;
  private readonly filterableFields: PrismaQueryableFields;

  constructor(
    filterableFields: PrismaQueryableFields,
    profile?: 'enabled' | 'disabled' | ConfigProfile
  ) {
    this.profile = loadProfile(profile);
    this.findOptions = new OptionsCollection();
    this.filterFactory = new FilterFactory();
    this.filterableFields = filterableFields;
  }

  public build(query: QueryString = {}): PrismaQuery {
    const prismaQuery: PrismaQuery = {};
    const requestQuery = { ...query };

    for (const option of this.findOptions.options) {
      option.setOption(
        {
          source: requestQuery,
          target: prismaQuery,
          fields: this.filterableFields,
        },
        this.profile
      );
    }

    for (const queryItem in requestQuery) {
      const filter = this.filterFactory.get({
        query: prismaQuery,
        key: queryItem,
        value: requestQuery[queryItem],
        fields: this.filterableFields,
      });
      if (filter) {
        filter.buildQuery();
      }
    }

    return prismaQuery;
  }
}
