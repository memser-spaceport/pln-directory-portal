import { DEFAULT_PAGINATION } from '../../fixtures/default-pagination';
import { PrismaQueryBuilder } from '../../prisma-query-builder';
import { ConfigProfile } from '../../profile';
import { DISABLED_PROFILE, ENABLED_PROFILE } from '../../profile/defaults';

describe('Pagination Option', () => {
  let prismaQueryBuilder: PrismaQueryBuilder;
  let profile: ConfigProfile;

  describe('when being instantiated with the default profile ', () => {
    beforeEach(() => {
      profile = ENABLED_PROFILE;
      prismaQueryBuilder = new PrismaQueryBuilder({}, profile);
    });

    describe('and without having its option specified', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build();
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with pagination param specified as true', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          pagination: 'true',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with pagination param specified as false', () => {
      it('should not include pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          pagination: 'false',
        });
        expect(prismaQuery).toEqual({});
      });
    });

    describe('and with pagination param specified as undefined', () => {
      it('should include pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          pagination: undefined,
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with page param specified as zero', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          page: '0',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with page param specified as one', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          page: '1',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with page param specified as two', () => {
      it('should include pagination for the second page on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          page: '2',
        });
        expect(prismaQuery).toEqual({
          skip: 25,
          take: DEFAULT_PAGINATION.take,
        });
      });
    });

    describe('and with page param specified as ten', () => {
      it('should include pagination for the tenth page on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          page: '10',
        });
        expect(prismaQuery).toEqual({
          skip: 225,
          take: DEFAULT_PAGINATION.take,
        });
      });
    });

    describe('and with page param specified with a decimal value', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          page: '1.5',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with page param specified with a negative value', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          page: '-6',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with page param specified with an invalid numeric value', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          page: 'invalid',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with limit param specified as zero', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          limit: '0',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with limit param specified as one', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          limit: '0',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with limit param specified as one hundred', () => {
      it('should include pagination with one hundredth limit on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          limit: '100',
        });
        expect(prismaQuery).toEqual({
          skip: 0,
          take: 100,
        });
      });
    });

    describe('and with limit param specified with a decimal value', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          limit: '1.5',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with limit param specified with a negative value', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          limit: '-6',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });

    describe('and with limit param specified with an invalid numeric value', () => {
      it('should include default pagination on the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          limit: 'invalid',
        });
        expect(prismaQuery).toEqual(DEFAULT_PAGINATION);
      });
    });
  });

  describe('when being instantiated with a custom items-per-page configured', () => {
    const TEST_CUSTOM_ITEMS_PER_PAGE = 50;

    beforeEach(() => {
      profile = ENABLED_PROFILE;
      profile.options.pagination.itemsPerPage = TEST_CUSTOM_ITEMS_PER_PAGE;
      prismaQueryBuilder = new PrismaQueryBuilder({}, profile);
    });

    it('should include pagination with custom items-per-page on the Prisma query', () => {
      const prismaQuery = prismaQueryBuilder.build({
        pagination: undefined,
      });
      expect(prismaQuery).toEqual({
        skip: 0,
        take: TEST_CUSTOM_ITEMS_PER_PAGE,
      });
    });
  });

  describe('when being instantiated with pagination config disabled', () => {
    beforeEach(() => {
      profile = DISABLED_PROFILE;
      prismaQueryBuilder = new PrismaQueryBuilder({}, profile);
    });

    it('should not include pagination on the Prisma query', () => {
      const prismaQuery = prismaQueryBuilder.build();
      expect(prismaQuery).toEqual({});
    });
  });
});
