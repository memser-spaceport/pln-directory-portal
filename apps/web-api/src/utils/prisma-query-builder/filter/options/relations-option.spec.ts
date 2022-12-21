import { PrismaQueryableFields } from '../../prisma-fields';
import { PrismaQueryBuilder } from '../../prisma-query-builder';
import { ConfigProfile } from '../../profile';
import { DISABLED_PROFILE, ENABLED_PROFILE } from '../../profile/defaults';

describe('Relations Option', () => {
  let prismaQueryBuilder: PrismaQueryBuilder;
  let profile: ConfigProfile;
  let prismaModelFields: PrismaQueryableFields;

  const TEST_DEFAULT_QUERY_KEY = 'include';
  const TEST_ADDITIONAL_QUERY_KEY = 'select';

  describe('when being instantiated with the default (enabled) profile', () => {
    beforeEach(() => {
      profile = ENABLED_PROFILE;
      prismaModelFields = {
        name: true,
        email: true,
        nested: {
          address: true,
        },
        nestedList: {
          _many: true,
          title: true,
        },
      };
      prismaQueryBuilder = new PrismaQueryBuilder(prismaModelFields, profile);
    });

    describe('and without its corresponding option', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build();
        const hasRelationsInQuery = TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasRelationsInQuery).toBeFalsy();
      });
    });

    describe('and with relations specified with an empty value', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          with: '',
        });
        const hasRelationsInQuery = TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasRelationsInQuery).toBeFalsy();
      });
    });

    describe('and with relations specified with an invalid value', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          with: ['name'],
        });
        const hasRelationsInQuery = TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasRelationsInQuery).toBeFalsy();
      });
    });

    describe('and with relations specified with an unexisting field', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          with: 'unexisting',
        });
        const hasRelationsInQuery = TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasRelationsInQuery).toBeFalsy();
      });
    });

    describe('and with relations specified with a direct primitive field', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          with: 'name',
        });
        const hasRelationsInQuery = TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasRelationsInQuery).toBeFalsy();
      });
    });

    describe('and with relations specified with a field using a prefix', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          with: '-nested.address',
        });
        const hasRelationsInQuery = TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasRelationsInQuery).toBeFalsy();
      });
    });

    describe('and with relations specified with repeated fields', () => {
      it('should account only for the first occurrences on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          with: 'nested,nestedList,nested,nestedList',
        });
        const hasRelationsInQuery = TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasRelationsInQuery).toBeTruthy();
        expect(prismaQuery[TEST_DEFAULT_QUERY_KEY]).toStrictEqual({
          nested: true,
          nestedList: true,
        });
      });
    });

    describe('and with relations specified with a nested primitive field', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          with: 'nested.address',
        });
        const hasRelationsInQuery = TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasRelationsInQuery).toBeFalsy();
      });
    });

    describe('and with the same relations and select specified on a existing field', () => {
      it('should only account for the select on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          with: 'nestedList.title',
          select: 'nestedList.title',
        });
        const hasInvalidRelationsInQuery =
          TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasInvalidRelationsInQuery).toBeFalsy();
        const hasValidRelationsInQuery =
          TEST_ADDITIONAL_QUERY_KEY in prismaQuery;
        expect(hasValidRelationsInQuery).toBeTruthy();
        expect(prismaQuery[TEST_ADDITIONAL_QUERY_KEY]).toStrictEqual({
          nestedList: {
            select: {
              title: true,
            },
          },
        });
      });
    });

    describe('and with the different relations and select specified on existing fields', () => {
      it('should account for both on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          with: 'nested',
          select: 'nestedList.title',
        });
        const hasInvalidRelationsInQuery =
          TEST_DEFAULT_QUERY_KEY in prismaQuery;
        expect(hasInvalidRelationsInQuery).toBeFalsy();
        const hasValidRelationsInQuery =
          TEST_ADDITIONAL_QUERY_KEY in prismaQuery;
        expect(hasValidRelationsInQuery).toBeTruthy();
        expect(prismaQuery[TEST_ADDITIONAL_QUERY_KEY]).toStrictEqual({
          nested: true,
          nestedList: {
            select: {
              title: true,
            },
          },
        });
      });
    });
  });

  describe('when being instantiated with relations disabled', () => {
    beforeEach(() => {
      profile = DISABLED_PROFILE;
      prismaQueryBuilder = new PrismaQueryBuilder(prismaModelFields, profile);
    });

    it('should be excluded from the Prisma query', () => {
      const prismaQuery = prismaQueryBuilder.build({
        with: 'nested',
      });
      const hasRelationsInQuery = TEST_DEFAULT_QUERY_KEY in prismaQuery;
      expect(hasRelationsInQuery).toBeFalsy();
    });
  });
});
