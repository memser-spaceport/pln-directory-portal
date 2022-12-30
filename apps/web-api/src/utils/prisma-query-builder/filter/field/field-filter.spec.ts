import { PrismaQueryableFields } from '../../prisma-fields';
import { PrismaQueryBuilder } from '../../prisma-query-builder';
import { ConfigProfile } from '../../profile';
import { ENABLED_PROFILE } from '../../profile/defaults';

describe('Field Filter', () => {
  let prismaQueryBuilder: PrismaQueryBuilder;
  let profile: ConfigProfile;
  let prismaModelFields: PrismaQueryableFields;

  const TEST_OPTION_KEY = 'where';

  beforeEach(() => {
    profile = ENABLED_PROFILE;
    prismaModelFields = {
      name: true,
      age: {
        _type: 'number',
      },
      email: {
        _nullable: true,
      },
      location: {
        _nullable: true,
        city: {
          _nullable: true,
        },
      },
      isOnline: {
        _type: 'boolean',
      },
      skills: {
        _many: true,
        title: true,
        level: {
          _type: 'number',
        },
        description: {
          _nullable: true,
        },
      },
    };
    prismaQueryBuilder = new PrismaQueryBuilder(prismaModelFields, profile);
  });

  // * 1 - Unexisting field
  describe('and with a unexisting field', () => {
    it('should exclude it from the Prisma query', () => {
      const prismaQuery = prismaQueryBuilder.build({
        unexisting: 'value',
      });
      const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
      expect(hasFilterInQuery).toBeFalsy();
    });
  });

  // * 2 - Invalid value type
  describe('and with an invalid value type', () => {
    it('should exclude it from the Prisma query', () => {
      const prismaQuery = prismaQueryBuilder.build({
        name: ['value'],
      });
      const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
      expect(hasFilterInQuery).toBeFalsy();
    });
  });

  // * 3 - Existing string field
  describe('and with an existing string field', () => {
    describe('and with an unexisting lookup type', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          name__unexisting: 'value',
        });
        const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasFilterInQuery).toBeFalsy();
      });
    });

    describe('and with an exact lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          name: 'Joe',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: 'Joe',
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            name__not: 'Joe',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { name: 'Joe' },
          });
        });
      });
    });

    describe('and with a contains lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          name__contains: 'joe',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: {
            contains: 'joe',
          },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            name__not__contains: 'Joe',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: {
              name: { contains: 'Joe' },
            },
          });
        });
      });
    });

    describe('and with an insensitive contains lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          name__icontains: 'joe',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: {
            contains: 'joe',
            mode: 'insensitive',
          },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            name__not__icontains: 'Joe',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: {
              name: { contains: 'Joe', mode: 'insensitive' },
            },
          });
        });
      });
    });

    describe('and with a startswith lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          name__startswith: 'joh',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: {
            startsWith: 'joh',
          },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            name__not__startswith: 'joh',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: {
              name: { startsWith: 'joh' },
            },
          });
        });
      });
    });

    describe('and with a insensitive startswith lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          name__istartswith: 'Joh',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: {
            startsWith: 'Joh',
            mode: 'insensitive',
          },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            name__not__istartswith: 'Joh',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: {
              name: {
                startsWith: 'Joh',
                mode: 'insensitive',
              },
            },
          });
        });
      });
    });

    describe('and with a endswith lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          name__endswith: 'joh',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: {
            endsWith: 'joh',
          },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            name__not__endswith: 'joh',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: {
              name: { endsWith: 'joh' },
            },
          });
        });
      });
    });

    describe('and with a insensitive endswith lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          name__iendswith: 'Joh',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: {
            endsWith: 'Joh',
            mode: 'insensitive',
          },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            name__not__iendswith: 'Joh',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: {
              name: {
                endsWith: 'Joh',
                mode: 'insensitive',
              },
            },
          });
        });
      });
    });

    describe('and with an in lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          name__in: 'joe,carl',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          name: {
            in: ['joe', 'carl'],
          },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            name__not__in: 'joe,carl',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: {
              name: {
                in: ['joe', 'carl'],
              },
            },
          });
        });
      });
    });

    describe('and with an with lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          'skills.title__with': 'joe,carl',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          AND: [
            { skills: { some: { title: 'joe' } } },
            { skills: { some: { title: 'carl' } } },
          ],
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'skills.title__not__with': 'joe,carl',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            AND: [
              {
                NOT: {
                  skills: { some: { title: 'joe' } },
                },
              },
              {
                NOT: {
                  skills: { some: { title: 'carl' } },
                },
              },
            ],
          });
        });
      });
    });

    describe('and with multiple with lookups', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          'skills.title__with': 'joe,carl',
          'location.city__with': 'porto,lisbon',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          AND: [
            { skills: { some: { title: 'joe' } } },
            { skills: { some: { title: 'carl' } } },
            { location: { city: 'porto' } },
            { location: { city: 'lisbon' } },
          ],
        });
      });

      describe('and with a single value', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'skills.title__with': 'joe',
            'location.city__with': 'porto',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            AND: [
              { skills: { some: { title: 'joe' } } },
              { location: { city: 'porto' } },
            ],
          });
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'skills.title__not__with': 'joe,carl',
            'location.city__not__with': 'porto,lisbon',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            AND: [
              {
                NOT: {
                  skills: { some: { title: 'joe' } },
                },
              },
              {
                NOT: {
                  skills: { some: { title: 'carl' } },
                },
              },
              {
                NOT: {
                  location: { city: 'porto' },
                },
              },
              {
                NOT: {
                  location: { city: 'lisbon' },
                },
              },
            ],
          });
        });

        describe('and with a single value', () => {
          it('should include it in the Prisma query', () => {
            const prismaQuery = prismaQueryBuilder.build({
              'skills.title__not__with': 'joe',
              'location.city__not__with': 'porto',
            });
            expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
              AND: [
                { NOT: { skills: { some: { title: 'joe' } } } },
                { NOT: { location: { city: 'porto' } } },
              ],
            });
          });
        });
      });
    });
  });

  // * 4 - Existing nullable field
  describe('and with an existing nullable field', () => {
    describe('and with an invalid lookup', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          email__invalid: 'value',
        });
        const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasFilterInQuery).toBeFalsy();
      });
    });

    describe('and with an exact lookup', () => {
      describe('and with a null value', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            email: 'null',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            email: null,
          });
        });
      });

      describe('and with an actual value', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            email: 'hello@pixelmatters.com',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            email: 'hello@pixelmatters.com',
          });
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            email__not: 'null',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { email: null },
          });
        });
      });
    });
  });

  // * 5 - Existing numeric field
  describe('and with an existing numeric field', () => {
    describe('and with an unexisting lookup type', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          age__unexisting: 'value',
        });
        const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasFilterInQuery).toBeFalsy();
      });
    });

    describe('and with an invalid numeric value', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          age: 'invalid',
        });
        const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasFilterInQuery).toBeFalsy();
      });
    });

    describe('and with an exact lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          age: '20',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          age: 20,
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            age__not: '20',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { age: 20 },
          });
        });
      });
    });

    describe('and with a greater than lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          age__gt: '20',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          age: { gt: 20 },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            age__not__gt: '20',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { age: { gt: 20 } },
          });
        });
      });
    });

    describe('and with a greater than equal lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          age__gte: '20',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          age: { gte: 20 },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            age__not__gte: '20',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { age: { gte: 20 } },
          });
        });
      });
    });

    describe('and with a less than lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          age__lt: '20',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          age: { lt: 20 },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            age__not__lt: '20',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { age: { lt: 20 } },
          });
        });
      });
    });

    describe('and with a less than equal lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          age__lte: '20',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          age: { lte: 20 },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            age__not__lte: '20',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { age: { lte: 20 } },
          });
        });
      });
    });

    describe('and with a between lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          age__between: '20,30',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          age: { gte: 20, lte: 30 },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            age__not__between: '20,30',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { age: { gte: 20, lte: 30 } },
          });
        });
      });
    });

    describe('and with an in lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          age__in: '20,30',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          age: { in: [20, 30] },
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            age__not__in: '20,30',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { age: { in: [20, 30] } },
          });
        });
      });
    });

    describe('and with an with lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          'skills.level__with': '10,20',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          AND: [
            { skills: { some: { level: 10 } } },
            { skills: { some: { level: 20 } } },
          ],
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'skills.level__not__with': '10,20',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            AND: [
              {
                NOT: {
                  skills: { some: { level: 10 } },
                },
              },
              {
                NOT: {
                  skills: { some: { level: 20 } },
                },
              },
            ],
          });
        });
      });
    });
  });

  // * 6 - Existing boolean field
  describe('and with a boolean field', () => {
    describe('and with an invalid lookup', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          isOnline__invalid: 'true',
        });
        const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasFilterInQuery).toBeFalsy();
      });
    });

    describe('and with an exact lookup', () => {
      it('should include it in the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          isOnline: 'false',
        });
        expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
          isOnline: false,
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            isOnline__not: 'true',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { isOnline: true },
          });
        });
      });
    });
  });

  // * 7 - Existing relational field
  describe('and with a relational field', () => {
    describe('and with an invalid lookup', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          location__invalid: 'value',
        });
        const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasFilterInQuery).toBeFalsy();
      });
    });

    describe('and with an exact lookup', () => {
      describe('and using a string value', () => {
        it('should exclude it from the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            location: 'Porto',
          });
          const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
          expect(hasFilterInQuery).toBeFalsy();
        });
      });

      describe('and using a null value', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            location: 'null',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            location: null,
          });
        });
      });

      describe('and with an negation operator', () => {
        describe('and using a string value', () => {
          it('should exclude it from the Prisma query', () => {
            const prismaQuery = prismaQueryBuilder.build({
              location__not: 'Porto',
            });
            const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
            expect(hasFilterInQuery).toBeFalsy();
          });
        });

        describe('and using a null value', () => {
          it('should include it in the Prisma query', () => {
            const prismaQuery = prismaQueryBuilder.build({
              location__not: 'null',
            });
            expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
              NOT: { location: null },
            });
          });
        });
      });
    });
  });

  // * 8 - Existing nested nullable field
  describe('and with an existing nested nullable field', () => {
    describe('and with an invalid lookup', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          'location.city__invalid': 'value',
        });
        const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasFilterInQuery).toBeFalsy();
      });
    });

    describe('and with an exact lookup', () => {
      describe('and with a null value', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'location.city': 'null',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            location: { city: null },
          });
        });
      });

      describe('and with an actual value', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'location.city': 'Porto',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            location: { city: 'Porto' },
          });
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'location.city__not': 'Porto',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { location: { city: 'Porto' } },
          });
        });
      });
    });
  });

  // * 9 - Existing relational list field
  describe('and with an existing relational list field', () => {
    describe('and with an unexisting lookup type', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          skills__unexisting: 'value',
        });
        const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasFilterInQuery).toBeFalsy();
      });
    });

    describe('and with an exact lookup', () => {
      describe('and with a null value', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            skills: 'null',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            skills: { none: {} },
          });
        });
      });

      describe('and with an actual value', () => {
        it('should exclude it from the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            skills: 'Dancing',
          });
          const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
          expect(hasFilterInQuery).toBeFalsy();
        });
      });

      describe('and with an negation operator', () => {
        describe('and with a null value', () => {
          it('should include it in the Prisma query', () => {
            const prismaQuery = prismaQueryBuilder.build({
              skills__not: 'null',
            });
            expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
              NOT: { skills: { none: {} } },
            });
          });
        });
        describe('and with an actual value', () => {
          it('should exclde it from the Prisma query', () => {
            const prismaQuery = prismaQueryBuilder.build({
              skills__not: 'Dancing',
            });
            const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
            expect(hasFilterInQuery).toBeFalsy();
          });
        });
      });
    });
  });

  // * 10 - Existing nested list nullable field
  describe('and with an existing nested list field', () => {
    describe('and with an invalid lookup', () => {
      it('should exclude it from the Prisma query', () => {
        const prismaQuery = prismaQueryBuilder.build({
          'skills.title__invalid': 'value',
        });
        const hasFilterInQuery = TEST_OPTION_KEY in prismaQuery;
        expect(hasFilterInQuery).toBeFalsy();
      });
    });

    describe('and with an exact lookup', () => {
      describe('and with an actual value', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'skills.title': 'Hello World',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            skills: { some: { title: 'Hello World' } },
          });
        });
      });

      describe('and with a null value', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'skills.title': 'null',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            skills: { some: { title: 'null' } },
          });
        });
      });

      describe('and with an negation operator', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'skills.title__not': 'Hello World',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            NOT: { skills: { some: { title: 'Hello World' } } },
          });
        });
      });

      describe('and with a nullable field', () => {
        it('should include it in the Prisma query', () => {
          const prismaQuery = prismaQueryBuilder.build({
            'skills.description': 'null',
          });
          expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
            skills: { none: { description: null } },
          });
        });

        describe('and with an negation operator', () => {
          it('should include it in the Prisma query', () => {
            const prismaQuery = prismaQueryBuilder.build({
              'skills.description__not': 'null',
            });
            expect(prismaQuery[TEST_OPTION_KEY]).toStrictEqual({
              NOT: { skills: { none: { description: null } } },
            });
          });
        });
      });
    });
  });
});
