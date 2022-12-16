import { PrismaQueryableFields } from '../../prisma-fields';
import { PrismaQueryBuilder } from '../../prisma-query-builder';
import { ConfigProfile } from '../../profile';
import { ENABLED_PROFILE } from '../../profile/defaults';

describe('Distinct option', () => {
  let prismaQueryBuilder: PrismaQueryBuilder;
  let profile: ConfigProfile;
  let prismaModelFields: PrismaQueryableFields;
  const TEST_OPTION_KEY = 'distinct';

  describe('when being instantiated with the default (enabled) profile ', () => {
    beforeEach(() => {
      profile = ENABLED_PROFILE;
      prismaModelFields = {
        name: true,
        email: true,
      };
      prismaQueryBuilder = new PrismaQueryBuilder(prismaModelFields, profile);
    });

    describe('and without its corresponding option', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build();
        const hasDistinctInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasDistinctInQuery).toBeFalsy();
      });
    });

    describe('and with distinct specified with an empty value', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          distinct: '',
        });
        const hasDistinctInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasDistinctInQuery).toBeFalsy();
      });
    });

    describe('and with distinct specified with an invalid value', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          distinct: ['invalid'],
        });
        const hasDistinctInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasDistinctInQuery).toBeFalsy();
      });
    });

    describe('and with distinct specified with an unexisting field', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          distinct: 'nonexisting',
        });
        const hasDistinctInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasDistinctInQuery).toBeFalsy();
      });
    });

    describe('and with distinct specified with an existing field', () => {
      it('should be included in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          distinct: 'name',
        });
        const hasDistinctInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasDistinctInQuery).toBeTruthy();
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual(['name']);
      });
    });
    describe('and with distinct specified with multiple fields', () => {
      it('should be included in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          distinct: 'name,email',
        });
        const hasDistinctInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasDistinctInQuery).toBeTruthy();
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual(['name', 'email']);
      });
    });
  });
});
