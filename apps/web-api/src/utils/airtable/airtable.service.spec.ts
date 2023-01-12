import { AirtableService } from './airtable.service';
import axios from 'axios';

jest.mock('axios');

describe('AirtableService', () => {
  let airtableService: AirtableService;
  const TEST_TEAMS = ['pixelmatters'];
  const TEST_TEAMS_WITH_OFFSET = ['spaceport'];
  const TEST_ALL_TEAMS = [...TEST_TEAMS, ...TEST_TEAMS_WITH_OFFSET];

  describe('when fetching teams without the necessary environment variables', () => {
    beforeEach(() => {
      airtableService = new AirtableService();
    });

    it('should throw an error', async () => {
      let thrownError;
      try {
        await airtableService.getAllTeams();
      } catch (error) {
        thrownError = error;
      }
      expect(thrownError).toBeInstanceOf(Error);
    });
  });

  describe('when fetching teams with the necessary environment variables', () => {
    beforeEach(() => {
      global.process.env.AIRTABLE_TEAMS_TABLE_ID = 'id';
      airtableService = new AirtableService();
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    describe('and the request fails', () => {
      it('should throw an error', async () => {
        jest.spyOn(axios, 'get').mockImplementation(() => Promise.reject());
        let thrownError;
        try {
          await airtableService.getAllTeams();
        } catch (error) {
          thrownError = error;
        }
        expect(thrownError).toBeInstanceOf(Error);
      });
    });

    describe('and the request succeeds', () => {
      describe('and without an offset of results', () => {
        it('should return all teams', async () => {
          jest.spyOn(axios, 'get').mockImplementation(() =>
            Promise.resolve({
              data: {
                records: TEST_TEAMS,
              },
            })
          );
          const teams = await airtableService.getAllTeams();
          expect(teams).toStrictEqual(TEST_TEAMS);
        });
      });

      describe('and with an offset of results', () => {
        it('should return all teams', async () => {
          jest.spyOn(axios, 'get').mockImplementation((url) =>
            Promise.resolve({
              data: {
                ...(!url.includes('offset') && { offset: 'offset' }),
                records: url.includes('offset')
                  ? TEST_TEAMS_WITH_OFFSET
                  : TEST_TEAMS,
              },
            })
          );
          const teams = await airtableService.getAllTeams();
          expect(teams).toStrictEqual(TEST_ALL_TEAMS);
        });
      });
    });
  });
});
