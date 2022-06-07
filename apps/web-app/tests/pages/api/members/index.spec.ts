import airtableService from '@protocol-labs-network/airtable';
import { IMember } from '@protocol-labs-network/api';
import { NextApiRequest, NextApiResponse } from 'next';
import getMembersHandler from '../../../../pages/api/members';

const mockMembers = [{}] as IMember[];
jest.mock('@protocol-labs-network/airtable', () => ({
  getMembers: jest.fn(() => mockMembers),
}));

describe('/api/members', () => {
  const json = jest.fn();
  const end = jest.fn();
  const setHeader = jest.fn();
  const status = jest.fn(() => ({ json, end }));
  const req: NextApiRequest = {
    method: 'GET',
  } as unknown as NextApiRequest;
  const res: NextApiResponse = {
    status,
    setHeader,
  } as unknown as NextApiResponse;

  beforeEach(() => {
    jest.clearAllMocks();
    getMembersHandler(req, res);
  });

  describe('and the request method is not supported', () => {
    let oldMethod: string;

    beforeAll(() => {
      oldMethod = req.method;
      req.method = 'POST';
    });

    it('should respond with an error', () => {
      expect(setHeader).toHaveBeenCalledTimes(1);
      expect(setHeader).toHaveBeenCalledWith('Allow', ['GET']);
      expect(status).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(405);
      expect(end).toHaveBeenCalledTimes(1);
      expect(end).toHaveBeenCalledWith('🚫 Method POST Not Allowed');
    });

    afterAll(() => {
      req.method = oldMethod;
    });
  });

  it('should get the members from AirtableService', () => {
    expect(airtableService.getMembers).toHaveBeenCalledTimes(1);
    expect(airtableService.getMembers).toHaveBeenCalledWith();
  });

  describe('and AirtableService successfully retrieves the members', () => {
    it('should respond with the provided members', () => {
      expect(status).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith(mockMembers);
    });
  });

  describe('and AirtableService fails to retrieve the members', () => {
    beforeAll(() => {
      jest.spyOn(airtableService, 'getMembers').mockImplementationOnce(() => {
        throw new Error();
      });
    });

    it('should respond with an error', () => {
      expect(status).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith({
        msg: 'Ups, something went wrong 😕',
      });
    });
  });
});
