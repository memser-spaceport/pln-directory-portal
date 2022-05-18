import airtableService from '@protocol-labs-network/airtable';
import { ITeam } from '@protocol-labs-network/api';
import { NextApiRequest, NextApiResponse } from 'next';
import getTeamsHandler from '../../../../pages/api/teams';

const mockTeams = [{}] as ITeam[];
jest.mock('@protocol-labs-network/airtable', () => ({
  getTeams: jest.fn(() => mockTeams),
}));

const mockOptions = { sort: { field: 'Name', direction: 'desc' } };
jest.mock('../../../utils/api/list.utils', () => ({
  getListRequestOptionsFromQuery: jest.fn(() => mockOptions),
}));

describe('/api/teams', () => {
  const json = jest.fn();
  const end = jest.fn();
  const setHeader = jest.fn();
  const status = jest.fn(() => ({ json, end }));
  const req: NextApiRequest = {
    method: 'GET',
    query: {},
  } as unknown as NextApiRequest;
  const res: NextApiResponse = {
    status,
    setHeader,
  } as unknown as NextApiResponse;

  beforeEach(() => {
    jest.clearAllMocks();
    getTeamsHandler(req, res);
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

  it('should get the teams from AirtableService', () => {
    expect(airtableService.getTeams).toHaveBeenCalledTimes(1);
    expect(airtableService.getTeams).toHaveBeenCalledWith(mockOptions);
  });

  describe('and AirtableService successfully retrieves the teams', () => {
    it('should respond with the provided teams', () => {
      expect(status).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith(mockTeams);
    });
  });

  describe('and AirtableService fails to retrieve the teams', () => {
    beforeAll(() => {
      jest.spyOn(airtableService, 'getTeams').mockImplementationOnce(() => {
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
