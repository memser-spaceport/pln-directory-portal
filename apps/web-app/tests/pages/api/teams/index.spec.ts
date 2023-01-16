import airtableService from '@protocol-labs-network/airtable';
import { NextApiRequest, NextApiResponse } from 'next';
import { env } from 'process';
import getTeamsHandler from '../../../../pages/api/teams';
import { getTeamsDirectoryRequestParametersFromQuery } from '../../../../utils/list.utils';

const mockTeams = {
  records: [{ Name: 'team_01' }, { Name: 'team_02' }],
  offset: 'offset',
};
const jsonMock: jest.Mock<
  Promise<{
    records: { [prop: string]: string }[];
    offset?: string;
  }>,
  []
> = jest.fn(() => Promise.resolve(mockTeams));
(global.fetch as jest.Mock) = jest.fn(() =>
  Promise.resolve({
    json: jsonMock,
  })
);

const mockParsedTeams = [{ name: 'team_01' }, { name: 'team_02' }];
jest.mock('@protocol-labs-network/airtable', () => ({
  parseTeams: jest.fn(() => mockParsedTeams),
}));

const mockQueryParamsString = 'mockQueryParamsString';
jest.mock('../../../../utils/list.utils', () => ({
  getTeamsDirectoryRequestParametersFromQuery: jest.fn(
    () => mockQueryParamsString
  ),
}));

describe('/api/teams', () => {
  const resJson = jest.fn();
  const resEnd = jest.fn();
  const resSetHeader = jest.fn();
  const resStatus = jest.fn(() => ({ json: resJson, end: resEnd }));
  const req: NextApiRequest = {
    method: 'GET',
    query: {},
  } as unknown as NextApiRequest;
  const res: NextApiResponse = {
    status: resStatus,
    setHeader: resSetHeader,
  } as unknown as NextApiResponse;

  beforeEach(async () => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    await getTeamsHandler(req, res);
  });

  describe('and the request method is not supported', () => {
    let oldMethod: string;

    beforeAll(() => {
      oldMethod = req.method;
      req.method = 'POST';
    });

    it('should respond with an error', () => {
      expect(resSetHeader).toHaveBeenCalledTimes(1);
      expect(resSetHeader).toHaveBeenCalledWith('Allow', ['GET']);
      expect(resStatus).toHaveBeenCalledTimes(1);
      expect(resStatus).toHaveBeenCalledWith(405);
      expect(resEnd).toHaveBeenCalledTimes(1);
      expect(resEnd).toHaveBeenCalledWith('🚫 Method POST Not Allowed');
      expect(fetch).not.toHaveBeenCalled();
    });

    afterAll(() => {
      req.method = oldMethod;
    });
  });

  it('should parse the provided query parameters into a query parameters string', () => {
    expect(getTeamsDirectoryRequestParametersFromQuery).toHaveBeenCalledWith(
      req.query
    );
  });

  describe('and there is an offset in the provided query parameters', () => {
    let oldQuery: { [key: string]: string | string[] };
    const offsetMock = 'some_offset';

    beforeAll(() => {
      oldQuery = req.query;
      req.query = { offset: offsetMock };
    });

    it('should only get a new page of teams', () => {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        encodeURI(
          `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TEAMS_TABLE_ID}?api_key=${env.AIRTABLE_API_KEY}&${mockQueryParamsString}&offset=${offsetMock}`
        )
      );
      expect(jsonMock).toHaveBeenCalledTimes(1);
      expect(resSetHeader).toHaveBeenCalledTimes(1);
      expect(resSetHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
      );
      expect(resStatus).toHaveBeenCalledTimes(1);
      expect(resStatus).toHaveBeenCalledWith(200);
      expect(airtableService.parseTeams).toHaveBeenCalledTimes(1);
      expect(airtableService.parseTeams).toHaveBeenCalledWith(
        mockTeams.records
      );
      expect(resJson).toHaveBeenCalledTimes(1);
      expect(resJson).toHaveBeenCalledWith({
        offset: mockTeams.offset,
        teams: mockParsedTeams,
      });
    });

    afterAll(() => {
      req.query = oldQuery;
    });
  });

  describe('and there is no offset in the provided query parameters', () => {
    describe('and there is an offset in the first request response', () => {
      const mockTeams02 = {
        records: [{ Name: 'team_03' }, { Name: 'team_04' }],
        offset: 'offset_02',
      };

      beforeAll(() => {
        jsonMock.mockReturnValueOnce(Promise.resolve(mockTeams));
        jsonMock.mockReturnValueOnce(Promise.resolve(mockTeams02));
      });

      it('should only get a new page of teams', () => {
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenNthCalledWith(
          1,
          encodeURI(
            `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TEAMS_TABLE_ID}?api_key=${env.AIRTABLE_API_KEY}&${mockQueryParamsString}`
          )
        );
        expect(fetch).toHaveBeenNthCalledWith(
          2,
          encodeURI(
            `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TEAMS_TABLE_ID}?api_key=${env.AIRTABLE_API_KEY}&${mockQueryParamsString}&offset=${mockTeams.offset}`
          )
        );
        expect(jsonMock).toHaveBeenCalledTimes(2);
        expect(resSetHeader).toHaveBeenCalledTimes(1);
        expect(resSetHeader).toHaveBeenCalledWith(
          'Cache-Control',
          'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
        );
        expect(resStatus).toHaveBeenCalledTimes(1);
        expect(resStatus).toHaveBeenCalledWith(200);
        expect(airtableService.parseTeams).toHaveBeenCalledTimes(1);
        expect(airtableService.parseTeams).toHaveBeenCalledWith(
          mockTeams02.records
        );
        expect(resJson).toHaveBeenCalledTimes(1);
        expect(resJson).toHaveBeenCalledWith({
          offset: mockTeams02.offset,
          teams: mockParsedTeams,
        });
      });
    });

    describe('and there is no offset in the first request response', () => {
      const mockTeamsWithoutOffset = {
        records: mockTeams.records,
      };

      beforeAll(() => {
        jsonMock.mockReturnValueOnce(Promise.resolve(mockTeamsWithoutOffset));
      });

      it('should only get a new page of teams', () => {
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(
          encodeURI(
            `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TEAMS_TABLE_ID}?api_key=${env.AIRTABLE_API_KEY}&${mockQueryParamsString}`
          )
        );
        expect(jsonMock).toHaveBeenCalledTimes(1);
        expect(resSetHeader).toHaveBeenCalledTimes(1);
        expect(resSetHeader).toHaveBeenCalledWith(
          'Cache-Control',
          'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
        );
        expect(resStatus).toHaveBeenCalledTimes(1);
        expect(resStatus).toHaveBeenCalledWith(200);
        expect(resJson).toHaveBeenCalledTimes(1);
        expect(resJson).toHaveBeenCalledWith({
          offset: '',
          teams: [],
        });
      });
    });
  });

  describe('and AirtableService fails to retrieve the teams', () => {
    beforeAll(() => {
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject());
    });

    it('should respond with an error', () => {
      expect(resStatus).toHaveBeenCalledTimes(1);
      expect(resStatus).toHaveBeenCalledWith(500);
      expect(resJson).toHaveBeenCalledTimes(1);
      expect(resJson).toHaveBeenCalledWith({
        error: {
          msg: 'Ups, something went wrong 😕',
        },
      });
    });
  });
});
