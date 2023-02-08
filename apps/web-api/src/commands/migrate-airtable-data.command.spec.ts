import { TEST_SERVICES_MOCK } from './__mocks__/migrate-airtable-data.mocks';
import { MigrateAirtableDataCommand } from './migrate-airtable-data.command';

jest.mock('fs');

describe('MigrateAirtableDataCommand', () => {
  let migrateCommand;
  let mockedServices: ReturnType<typeof TEST_SERVICES_MOCK>;

  describe('when running the airtable migration command', () => {
    beforeEach(() => {
      jest.spyOn(global.console, 'log').mockImplementation();
    });

    afterAll(() => {
      jest.resetAllMocks();
    });

    it('should call the technologies service to insert many from a list', async () => {
      mockedServices = TEST_SERVICES_MOCK();
      migrateCommand = new MigrateAirtableDataCommand(...mockedServices);
      await migrateCommand.run();
      expect(mockedServices[4].insertManyFromList).toHaveBeenCalled();
    });

    describe('and with invalid industry tags', () => {
      it('should throw an error', async () => {
        mockedServices = TEST_SERVICES_MOCK({
          getAllIndustryTags: () =>
            // This will purposely result in schema validation errors:
            Promise.resolve([
              {
                invalid: true,
              },
              {
                id: 1,
                fields: {
                  Tags: 100,
                  Definition: null,
                  Categories: 'invalid',
                },
              },
            ]),
        });
        migrateCommand = new MigrateAirtableDataCommand(...mockedServices);
        let schemaValidationErrors;
        try {
          await migrateCommand.run();
        } catch (errors) {
          schemaValidationErrors = errors;
        }
        expect(schemaValidationErrors).toBeDefined();
        // Verify that the amount of schema errors matches the issues present on the promise resolved above:
        expect(JSON.parse(schemaValidationErrors.message).length).toBe(6);
      });
    });

    describe('and with valid industry tags', () => {
      it('should call the industry categories service and industry tags service', async () => {
        const industryTagsWithoutCategories = [
          {
            id: 'id',
            fields: {
              Tags: 'Tags',
            },
          },
        ];
        mockedServices = TEST_SERVICES_MOCK({
          getAllIndustryTags: () =>
            Promise.resolve(industryTagsWithoutCategories),
        });
        migrateCommand = new MigrateAirtableDataCommand(...mockedServices);
        await migrateCommand.run();
        // Assert that it called the Industry Category Service with an empty list of categories:
        expect(mockedServices[8].insertManyFromList).toHaveBeenCalledWith([]);
        // Assert that it called the Industry Tag Service with the incoming data:
        expect(mockedServices[5].insertManyFromAirtable).toHaveBeenCalledWith(
          industryTagsWithoutCategories
        );
      });
    });

    describe('and with invalid teams', () => {
      it('should throw an error', async () => {
        mockedServices = TEST_SERVICES_MOCK({
          getAllTeams: () =>
            // This will purposely result in schema validation errors:
            Promise.resolve([
              {
                invalid: true,
                fields: null,
              },
              {
                id: 1,
                fields: {
                  Name: 1,
                },
              },
            ]),
        });
        migrateCommand = new MigrateAirtableDataCommand(...mockedServices);
        let schemaValidationErrors;
        try {
          await migrateCommand.run();
        } catch (errors) {
          schemaValidationErrors = errors;
        }
        expect(schemaValidationErrors).toBeDefined();
        // Verify that the amount of schema errors matches the issues present on the promise resolved above:
        expect(JSON.parse(schemaValidationErrors.message).length).toBe(4);
      });
    });

    describe('and with valid teams', () => {
      it('should call the funding stages, membership sources & teams service', async () => {
        const teams = [
          {
            id: 'id',
            fields: {
              Name: 'Name',
              'Funding Stage': 'Series A',
              'Accelerator Programs': ['Alliance'],
              'Date created': new Date('2023-01-31'),
            },
          },
        ];
        mockedServices = TEST_SERVICES_MOCK({
          getAllTeams: () => Promise.resolve(teams),
        });
        migrateCommand = new MigrateAirtableDataCommand(...mockedServices);
        await migrateCommand.run();
        // Assert that it called the Funding Stages Service:
        expect(mockedServices[6].insertManyFromList).toHaveBeenCalledWith([
          'Series A',
        ]);
        // Assert that it called the Membership Sources Service:
        expect(mockedServices[9].insertManyFromList).toHaveBeenCalledWith([
          'Alliance',
        ]);
        // Assert that it called the Teams Service with the incoming data:
        expect(mockedServices[0].insertManyFromAirtable).toHaveBeenCalledWith(
          teams
        );
      });
    });

    describe('and with invalid members', () => {
      it('should throw an error', async () => {
        mockedServices = TEST_SERVICES_MOCK({
          getAllMembers: () =>
            // This will purposely result in schema validation errors:
            Promise.resolve([
              {
                invalid: true,
                fields: null,
              },
              {
                id: 1,
                fields: {
                  Name: 1,
                  Skills: null,
                },
              },
            ]),
        });

        migrateCommand = new MigrateAirtableDataCommand(...mockedServices);
        let schemaValidationErrors;
        try {
          await migrateCommand.run();
        } catch (errors) {
          schemaValidationErrors = errors;
        }

        expect(schemaValidationErrors).toBeDefined();
        // Verify that the amount of schema errors matches the issues present on the promise resolved above:
        expect(JSON.parse(schemaValidationErrors.message).length).toBe(5);
      });
    });

    describe('and with valid members', () => {
      it('should call the roles, skills & members service', async () => {
        const members = [
          {
            id: 'id',
            fields: {
              Name: 'Name',
              Skills: ['AI'],
              Role: 'CEO',
              'Date created': new Date('2023-01-31'),
            },
          },
        ];
        mockedServices = TEST_SERVICES_MOCK({
          getAllMembers: () => Promise.resolve(members),
        });
        migrateCommand = new MigrateAirtableDataCommand(...mockedServices);
        await migrateCommand.run();
        // Assert that it called the Skills Service:
        expect(mockedServices[1].insertManyFromList).toHaveBeenCalledWith([
          'AI',
        ]);
        // Assert that it called the Members Service with the incoming data:
        expect(
          mockedServices[2].insertManyWithLocationsFromAirtable
        ).toHaveBeenCalledWith(members);
      });
    });

    it('should call the team member roles service', async () => {
      mockedServices = TEST_SERVICES_MOCK();
      migrateCommand = new MigrateAirtableDataCommand(...mockedServices);
      await migrateCommand.run();
      expect(mockedServices[7].insertManyFromAirtable).toHaveBeenCalled();
    });
  });
});
