import airtableService from '@protocol-labs-network/airtable';
import { NextApiRequest, NextApiResponse } from 'next';
import { env } from 'process';
import getMembersHandler from '../../../../pages/api/members';
import { getMembersDirectoryRequestParametersFromQuery } from '../../../../utils/list.utils';

const mockMembers = {
  records: [{ Name: 'member_01' }, { Name: 'member_02' }],
  offset: 'offset',
};
const jsonMock: jest.Mock<
  Promise<{
    records: { [prop: string]: string }[];
    offset?: string;
  }>,
  []
> = jest.fn(() => Promise.resolve(mockMembers));
(global.fetch as jest.Mock) = jest.fn(() =>
  Promise.resolve({
    json: jsonMock,
  })
);

const mockParsedMembers = [{ name: 'member_01' }, { name: 'member_02' }];
jest.mock('@protocol-labs-network/airtable', () => ({
  parseMembers: jest.fn(() => mockParsedMembers),
}));

const mockQueryParamsString = 'mockQueryParamsString';
jest.mock('../../../../utils/list.utils', () => ({
  getMembersDirectoryRequestParametersFromQuery: jest.fn(
    () => mockQueryParamsString
  ),
}));

describe('/api/members', () => {
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
    await getMembersHandler(req, res);
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
    expect(getMembersDirectoryRequestParametersFromQuery).toHaveBeenCalledWith(
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

    it('should only get a new page of members', () => {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        encodeURI(
          `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_MEMBERS_TABLE_ID}?api_key=${env.AIRTABLE_API_KEY}&${mockQueryParamsString}&offset=${offsetMock}`
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
      expect(airtableService.parseMembers).toHaveBeenCalledTimes(1);
      expect(airtableService.parseMembers).toHaveBeenCalledWith(
        mockMembers.records
      );
      expect(resJson).toHaveBeenCalledTimes(1);
      expect(resJson).toHaveBeenCalledWith({
        offset: mockMembers.offset,
        members: mockParsedMembers,
      });
    });

    afterAll(() => {
      req.query = oldQuery;
    });
  });

  describe('and there is no offset in the provided query parameters', () => {
    describe('and there is an offset in the first request response', () => {
      const mockMembers02 = {
        records: [{ Name: 'member_03' }, { Name: 'member_04' }],
        offset: 'offset_02',
      };

      beforeAll(() => {
        jsonMock.mockReturnValueOnce(Promise.resolve(mockMembers));
        jsonMock.mockReturnValueOnce(Promise.resolve(mockMembers02));
      });

      it('should only get a new page of members', () => {
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenNthCalledWith(
          1,
          encodeURI(
            `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_MEMBERS_TABLE_ID}?api_key=${env.AIRTABLE_API_KEY}&${mockQueryParamsString}`
          )
        );
        expect(fetch).toHaveBeenNthCalledWith(
          2,
          encodeURI(
            `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_MEMBERS_TABLE_ID}?api_key=${env.AIRTABLE_API_KEY}&${mockQueryParamsString}&offset=${mockMembers.offset}`
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
        expect(airtableService.parseMembers).toHaveBeenCalledTimes(1);
        expect(airtableService.parseMembers).toHaveBeenCalledWith(
          mockMembers02.records
        );
        expect(resJson).toHaveBeenCalledTimes(1);
        expect(resJson).toHaveBeenCalledWith({
          offset: mockMembers02.offset,
          members: mockParsedMembers,
        });
      });
    });

    describe('and there is no offset in the first request response', () => {
      const mockMembersWithoutOffset = {
        records: mockMembers.records,
      };

      beforeAll(() => {
        jsonMock.mockReturnValueOnce(Promise.resolve(mockMembersWithoutOffset));
      });

      it('should only get a new page of members', () => {
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(
          encodeURI(
            `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_MEMBERS_TABLE_ID}?api_key=${env.AIRTABLE_API_KEY}&${mockQueryParamsString}`
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
          members: [],
        });
      });
    });
  });

  describe('and AirtableService fails to retrieve the members', () => {
    beforeAll(() => {
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject());
    });

    it('should respond with an error', () => {
      expect(resStatus).toHaveBeenCalledTimes(1);
      expect(resStatus).toHaveBeenCalledWith(500);
      expect(resJson).toHaveBeenCalledTimes(1);
      expect(resJson).toHaveBeenCalledWith({
        error: { msg: 'Ups, something went wrong 😕' },
      });
    });
  });
});
