import airtableService from '@protocol-labs-network/airtable';
import { ILabber } from '@protocol-labs-network/api';
import { NextApiRequest, NextApiResponse } from 'next';
import getLabberHandler from '../../../../pages/api/labbers/[id]';

const mockLabber = {} as ILabber;
jest.mock('@protocol-labs-network/airtable', () => ({
  getLabber: jest.fn(() => mockLabber),
}));

describe('/api/labbers/:id', () => {
  const id = 'labberId_01';
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
    getLabberHandler(req, res);
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

  it('should get the labber with the provided id from AirtableService', () => {
    expect(airtableService.getLabber).toHaveBeenCalledTimes(1);
    expect(airtableService.getLabber).toHaveBeenCalledWith(id);
  });

  describe('and AirtableService successfully retrieves a labber', () => {
    it('should respond with the provided labber', () => {
      expect(status).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith(mockLabber);
    });
  });

  describe('and AirtableService fails to retrieve a labber', () => {
    beforeAll(() => {
      jest.spyOn(airtableService, 'getLabber').mockImplementationOnce(() => {
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
