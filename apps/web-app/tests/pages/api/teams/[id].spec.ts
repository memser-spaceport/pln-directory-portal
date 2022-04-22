import airtableService from '@protocol-labs-network/airtable';
import { ITeam } from '@protocol-labs-network/api';
import { NextApiRequest, NextApiResponse } from 'next';
import getTeamHandler from '../../../../pages/api/teams/[id]';

const mockTeam = {} as ITeam;
jest.mock('@protocol-labs-network/airtable', () => ({
  getTeam: jest.fn(() => mockTeam),
}));

describe('/api/teams/:id', () => {
  const id = 'teamId_01';
  const json = jest.fn();
  const end = jest.fn();
  const setHeader = jest.fn();
  const status = jest.fn(() => ({ json, end }));
  const req: NextApiRequest = {
    method: 'GET',
    query: { id },
  } as unknown as NextApiRequest;
  const res: NextApiResponse = {
    status,
    setHeader,
  } as unknown as NextApiResponse;

  beforeEach(() => {
    jest.clearAllMocks();
    getTeamHandler(req, res);
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

  it('should get the team with the provided id from AirtableService', () => {
    expect(airtableService.getTeam).toHaveBeenCalledTimes(1);
    expect(airtableService.getTeam).toHaveBeenCalledWith(id);
  });

  describe('and AirtableService successfully retrieves a team', () => {
    it('should respond with the provided team', () => {
      expect(status).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith(mockTeam);
    });
  });

  describe('and AirtableService fails to retrieve a team', () => {
    beforeAll(() => {
      jest.spyOn(airtableService, 'getTeam').mockImplementationOnce(() => {
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
