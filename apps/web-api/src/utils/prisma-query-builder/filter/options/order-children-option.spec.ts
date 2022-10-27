import get from 'lodash/get';
import { PrismaQueryableFields } from '../../prisma-fields';
import { PrismaQueryBuilder } from '../../prisma-query-builder';
import { ConfigProfile } from '../../profile';
import { DISABLED_PROFILE, ENABLED_PROFILE } from '../../profile/defaults';

describe('Order Children Option', () => {
  let prismaQueryBuilder: PrismaQueryBuilder;
  let profile: ConfigProfile;
  let prismaModelFields: PrismaQueryableFields;
  const TEST_EXISTING_FIELD = 'name';
  const TEST_EXISTING_NESTED_FIELD = 'nested';
  const TEST_OPTION_KEY = 'order';
  const TEST_QUERY_KEY = 'include';
  const TEST_QUERY_ADDITIONAL_KEY = 'select';
  const TEST_DEFAULT_ORDER = 'asc';
  const TEST_DESCENDING_ORDER = 'desc';

  describe('when being instantiated with the default profile ', () => {
    beforeEach(() => {
      profile = ENABLED_PROFILE;
      prismaModelFields = {
        [TEST_EXISTING_NESTED_FIELD]: {
          [TEST_EXISTING_FIELD]: true,
          [TEST_EXISTING_NESTED_FIELD]: true,
        },
        [TEST_EXISTING_FIELD]: {
          _many: true,
          [TEST_EXISTING_NESTED_FIELD]: true,
        },
      };
      prismaQueryBuilder = new PrismaQueryBuilder(prismaModelFields, profile);
    });

    describe('and without its corresponding option', () => {
      it('should be excluded from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          foo: 'bar',
        });
        const hasSortingInQuery = TEST_QUERY_KEY in prismaQuery;
        expect(hasSortingInQuery).toBeFalsy();
      });
    });

    describe('and with an invalid field type', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          [TEST_OPTION_KEY]: { unexistingField: 'otherField' },
        });
        const hasSortingInQuery = TEST_QUERY_KEY in prismaQuery;
        expect(hasSortingInQuery).toBeFalsy();
      });
    });

    describe('and with a unexisting field', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          [TEST_OPTION_KEY]: 'unexistingField',
        });
        const hasSortingInQuery = TEST_QUERY_KEY in prismaQuery;
        expect(hasSortingInQuery).toBeFalsy();
      });
    });

    describe('and with a unexisting nested field', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          [TEST_OPTION_KEY]: `${TEST_EXISTING_NESTED_FIELD}.unexistingNestedField`,
        });
        const hasSortingInQuery = TEST_QUERY_KEY in prismaQuery;
        expect(hasSortingInQuery).toBeFalsy();
      });
    });

    describe('and with a existing field', () => {
      describe('and without any explicit order specified', () => {
        it('should include it in the Prisma query with an ascending criteria', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD}`,
          });
          const queryPath = `${TEST_QUERY_KEY}.${TEST_EXISTING_NESTED_FIELD}.orderBy.${TEST_EXISTING_FIELD}`;
          const sortingQueryField = get(prismaQuery, queryPath);
          expect(sortingQueryField).toBe(TEST_DEFAULT_ORDER);
        });
      });

      describe('and with a descending order specified', () => {
        it('should include it in the Prisma query with an descending criteria', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `-${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD}`,
          });
          const queryPath = `${TEST_QUERY_KEY}.${TEST_EXISTING_NESTED_FIELD}.orderBy.${TEST_EXISTING_FIELD}`;
          const sortingQueryField = get(prismaQuery, queryPath);
          expect(sortingQueryField).toBe(TEST_DESCENDING_ORDER);
        });
      });

      describe('and a relation option', () => {
        it('should prioritize the order in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD}`,
            with: TEST_EXISTING_NESTED_FIELD,
          });
          const queryPath = `${TEST_QUERY_KEY}.${TEST_EXISTING_NESTED_FIELD}.orderBy.${TEST_EXISTING_FIELD}`;
          const sortingQueryField = get(prismaQuery, queryPath);
          expect(sortingQueryField).toBe(TEST_DEFAULT_ORDER);
        });
      });

      describe('and a select option', () => {
        it('should be included alongside the select fields in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            select: `${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD}`,
            [TEST_OPTION_KEY]: `${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD}`,
          });
          const queryPath = `${TEST_QUERY_ADDITIONAL_KEY}.${TEST_EXISTING_NESTED_FIELD}.orderBy.${TEST_EXISTING_FIELD}`;
          const sortingQueryField = get(prismaQuery, queryPath);
          expect(sortingQueryField).toBe(TEST_DEFAULT_ORDER);
        });
      });
    });

    describe('and with multiple fields', () => {
      describe("and some don't exist", () => {
        it('should exclude them from the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `
              unexisting,
              ${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD},
              missing
            `.replace(/\s/g, ''),
          });
          const hasOnlyValidFields =
            Object.keys(Object.assign({}, prismaQuery[TEST_QUERY_KEY]))
              .length === 1;
          expect(hasOnlyValidFields).toBeTruthy();
          const queryPath = `${TEST_QUERY_KEY}.${TEST_EXISTING_NESTED_FIELD}.orderBy.${TEST_EXISTING_FIELD}`;
          const sortingQueryField = get(prismaQuery, queryPath);
          expect(sortingQueryField).toBe(TEST_DEFAULT_ORDER);
        });
      });

      describe('and some are repeated with different sorting', () => {
        it('should account only the first ocurrence for the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `
              ${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD},
              -${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD}
            `.replace(/\s/g, ''),
          });
          const hasOnlyUniqueFields =
            Object.keys(Object.assign({}, prismaQuery[TEST_QUERY_KEY]))
              .length === 1;
          expect(hasOnlyUniqueFields).toBeTruthy();
          const queryPath = `${TEST_QUERY_KEY}.${TEST_EXISTING_NESTED_FIELD}.orderBy.${TEST_EXISTING_FIELD}`;
          const sortingQueryField = get(prismaQuery, queryPath);
          expect(sortingQueryField).toBe(TEST_DEFAULT_ORDER);
        });
      });

      describe('and some are repeated with different nested fields', () => {
        it('should account only the valid field for the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `
              ${TEST_EXISTING_NESTED_FIELD}.repeatedField,
              ${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD}
            `.replace(/\s/g, ''),
          });
          const hasOnlyUniqueFields =
            Object.keys(Object.assign({}, prismaQuery[TEST_QUERY_KEY]))
              .length === 1;
          expect(hasOnlyUniqueFields).toBeTruthy();
          const queryPath = `${TEST_QUERY_KEY}.${TEST_EXISTING_NESTED_FIELD}.orderBy.${TEST_EXISTING_FIELD}`;
          const sortingQueryField = get(prismaQuery, queryPath);
          expect(sortingQueryField).toBe(TEST_DEFAULT_ORDER);
        });
      });

      describe('and all exist', () => {
        it('should include them in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            [TEST_OPTION_KEY]: `
              ${TEST_EXISTING_FIELD}.${TEST_EXISTING_NESTED_FIELD},
              -${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD}
            `.replace(/\s/g, ''),
          });
          const hasAllUniqueFields =
            Object.keys(Object.assign({}, prismaQuery[TEST_QUERY_KEY]))
              .length === 2;
          expect(hasAllUniqueFields).toBeTruthy();
          const queryPaths = [
            `${TEST_QUERY_KEY}.${TEST_EXISTING_FIELD}.orderBy.${TEST_EXISTING_NESTED_FIELD}`,
            `${TEST_QUERY_KEY}.${TEST_EXISTING_NESTED_FIELD}.orderBy.${TEST_EXISTING_FIELD}`,
          ];
          const sortingQueryFields = queryPaths.map((path) =>
            get(prismaQuery, path)
          );
          expect(sortingQueryFields).toStrictEqual([
            TEST_DEFAULT_ORDER,
            TEST_DESCENDING_ORDER,
          ]);
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
        [TEST_OPTION_KEY]: `${TEST_EXISTING_NESTED_FIELD}.${TEST_EXISTING_FIELD}`,
      });
      const hasSortingInQuery = TEST_QUERY_KEY in prismaQuery;
      expect(hasSortingInQuery).toBeFalsy();
    });
  });
});
