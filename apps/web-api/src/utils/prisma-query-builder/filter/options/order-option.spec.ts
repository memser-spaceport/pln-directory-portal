import { PrismaQueryableFields } from '../../prisma-fields';
import { PrismaQueryBuilder } from '../../prisma-query-builder';
import { ConfigProfile } from '../../profile';
import { DISABLED_PROFILE, ENABLED_PROFILE } from '../../profile/defaults';

describe('Order Option', () => {
  let prismaQueryBuilder: PrismaQueryBuilder;
  let profile: ConfigProfile;
  let prismaModelFields: PrismaQueryableFields;
  const TEST_EXISTING_FIELD = 'name';
  const TEST_OPTION_KEY = 'orderBy';
  const TEST_DEFAULT_ORDER = 'asc';
  const TEST_DESCENDING_ORDER = 'desc';

  describe('when being instantiated with the default profile ', () => {
    beforeEach(() => {
      profile = ENABLED_PROFILE;
      prismaModelFields = {
        [TEST_EXISTING_FIELD]: true,
        otherExistingField: true,
        nestedField: {
          [TEST_EXISTING_FIELD]: true,
        },
      };
      prismaQueryBuilder = new PrismaQueryBuilder(prismaModelFields, profile);
    });

    describe('and without its corresponding option', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          foo: 'bar',
        });
        const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSortingInQuery).toBeFalsy();
      });
    });

    describe('and with an invalid field type', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          [TEST_OPTION_KEY]: { unexistingField: 'otherField' },
        });
        const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSortingInQuery).toBeFalsy();
      });
    });

    describe('and with a unexisting field', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          [TEST_OPTION_KEY]: 'unexistingField',
        });
        const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSortingInQuery).toBeFalsy();
      });
    });

    describe('and with a unexisting nested field', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          [TEST_OPTION_KEY]: `${TEST_EXISTING_FIELD}.unexistingNestedField`,
        });
        const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasSortingInQuery).toBeFalsy();
      });
    });

    describe('and with a existing field', () => {
      describe('and without any explicit order specified', () => {
        it('should include it in the Prisma query with an ascending criteria', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: TEST_EXISTING_FIELD,
          });
          const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
          expect(hasSortingInQuery).toBeTruthy();
          const sortingQueryField = prismaQuery?.[TEST_OPTION_KEY]?.[0] || {};
          expect(sortingQueryField[TEST_EXISTING_FIELD]).toBe(
            TEST_DEFAULT_ORDER
          );
        });
      });

      describe("and that field isn't sortable", () => {
        it('should exclude it from the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: 'nestedField',
          });
          const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
          expect(hasSortingInQuery).toBeFalsy();
        });
      });

      describe('and with a descending order specified', () => {
        it('should include it in the Prisma query with an descending criteria', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `-${TEST_EXISTING_FIELD}`,
          });
          const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
          expect(hasSortingInQuery).toBeTruthy();
          const sortingQueryField = prismaQuery?.[TEST_OPTION_KEY]?.[0] || {};
          expect(sortingQueryField[TEST_EXISTING_FIELD]).toBe(
            TEST_DESCENDING_ORDER
          );
        });
      });
    });

    describe('and with multiple fields', () => {
      describe("and some don't exist", () => {
        it('should exclude them from the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `unexisting,${TEST_EXISTING_FIELD},missing`,
          });
          const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
          expect(hasSortingInQuery).toBeTruthy();
          const hasOnlyValidFields =
            (prismaQuery?.[TEST_OPTION_KEY] || []).length === 1;
          expect(hasOnlyValidFields).toBeTruthy();
          const sortingQueryField = prismaQuery?.[TEST_OPTION_KEY]?.[0] || {};
          expect(sortingQueryField[TEST_EXISTING_FIELD]).toBe(
            TEST_DEFAULT_ORDER
          );
        });
      });

      describe('and some are repeated', () => {
        it('should account only the first ocurrence for the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `${TEST_EXISTING_FIELD},-${TEST_EXISTING_FIELD}`,
          });
          const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
          expect(hasSortingInQuery).toBeTruthy();
          const hasOnlyUniqueFields =
            (prismaQuery?.[TEST_OPTION_KEY] || []).length === 1;
          expect(hasOnlyUniqueFields).toBeTruthy();
          const sortingQueryField = prismaQuery?.[TEST_OPTION_KEY]?.[0] || {};
          expect(sortingQueryField[TEST_EXISTING_FIELD]).toBe(
            TEST_DEFAULT_ORDER
          );
        });
      });

      describe('and all exist', () => {
        it('should include them in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `${TEST_EXISTING_FIELD},-${TEST_EXISTING_FIELD}`,
          });
          const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
          expect(hasSortingInQuery).toBeTruthy();
          const hasOnlyUniqueFields =
            (prismaQuery?.[TEST_OPTION_KEY] || []).length === 1;
          expect(hasOnlyUniqueFields).toBeTruthy();
          const sortingQueryField = prismaQuery?.[TEST_OPTION_KEY]?.[0] || {};
          expect(sortingQueryField[TEST_EXISTING_FIELD]).toBe(
            TEST_DEFAULT_ORDER
          );
        });
      });
    });
  });

  describe('when being instantiated with sorting disabled', () => {
    beforeEach(() => {
      profile = DISABLED_PROFILE;
      prismaQueryBuilder = new PrismaQueryBuilder(prismaModelFields, profile);
    });

    it('should be excluded from the Prisma query', () => {
      const prismaQuery = prismaQueryBuilder.build({
        [TEST_OPTION_KEY]: TEST_EXISTING_FIELD,
      });
      const hasSortingInQuery = TEST_OPTION_KEY in prismaQuery;
      expect(hasSortingInQuery).toBeFalsy();
    });
  });
});
