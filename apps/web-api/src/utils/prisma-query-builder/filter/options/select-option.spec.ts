import { PrismaQueryableFields } from '../../prisma-fields';
import { PrismaQueryBuilder } from '../../prisma-query-builder';
import { ConfigProfile } from '../../profile';
import { DISABLED_PROFILE, ENABLED_PROFILE } from '../../profile/defaults';

describe('Select Option', () => {
  let prismaQueryBuilder: PrismaQueryBuilder;
  let profile: ConfigProfile;
  let prismaModelFields: PrismaQueryableFields;
  const TEST_OPTION_KEY = 'select';

  describe('when being instantiated with the default (enabled) profile ', () => {
    beforeEach(() => {
      profile = ENABLED_PROFILE;
      prismaModelFields = {
        name: true,
        email: true,
        nested: {
          address: true,
        },
        nestedList: {
          title: true,
        },
      };
      prismaQueryBuilder = new PrismaQueryBuilder(prismaModelFields, profile);
    });

    describe('and without its corresponding option', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build();
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSelectInQuery).toBeFalsy();
      });
    });

    describe('and with select specified with an empty value', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          select: '',
        });
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSelectInQuery).toBeFalsy();
      });
    });

    describe('and with select specified with an invalid value', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          select: ['name'],
        });
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSelectInQuery).toBeFalsy();
      });
    });

    describe('and with select specified with an unexisting field', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          select: 'unexisting',
        });
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSelectInQuery).toBeFalsy();
      });
    });

    describe('and with select specified with a nested primitive field', () => {
      it('should be included in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          select: 'nested.address',
        });
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSelectInQuery).toBeTruthy();
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          nested: { select: { address: true } },
        });
      });
    });

    describe('and with select specified with a nested list field', () => {
      it('should be included in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          select: 'nestedList.title',
        });
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSelectInQuery).toBeTruthy();
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          nestedList: { select: { title: true } },
        });
      });
    });

    describe('and with select specified with a field using a prefix', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          select: '-name',
        });
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSelectInQuery).toBeFalsy();
      });
    });

    describe('and with select specified with a existing field', () => {
      it('should be included on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          select: 'name',
        });
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSelectInQuery).toBeTruthy();
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: true,
        });
      });
    });

    describe('and with select specified with repeated fields', () => {
      it('should account only for the first occurrences on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          select: 'name,email,name,email',
        });
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSelectInQuery).toBeTruthy();
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: true,
          email: true,
        });
      });
    });

    describe('and with the same select and relations specified on a existing field', () => {
      it('should only account for the select on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          select: 'nestedList.title',
          with: 'nestedList.title',
        });
        const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
        const hasIncludeInQuery = 'include' in prismaQuery;
        expect(hasSelectInQuery).toBeTruthy();
        expect(hasIncludeInQuery).toBeFalsy();
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          nestedList: {
            select: {
              title: true,
            },
          },
        });
      });
    });
  });

  describe('when being instantiated with select disabled', () => {
    beforeEach(() => {
      profile = DISABLED_PROFILE;
      prismaQueryBuilder = new PrismaQueryBuilder(prismaModelFields, profile);
    });

    it('should be excluded from the Prisma query', () => {
      const prismaQuery = prismaQueryBuilder.build({
        select: 'name',
      });
      const hasSelectInQuery = TEST_OPTION_KEY in prismaQuery;
      expect(hasSelectInQuery).toBeFalsy();
    });
  });
});
