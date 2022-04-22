import airtableService from '@protocol-labs-network/airtable';
import { ILabber } from '@protocol-labs-network/api';
import { NextApiRequest, NextApiResponse } from 'next';
import getLabbersHandler from '../../../../pages/api/labbers';

const mockLabbers = [{}] as ILabber[];
jest.mock('@protocol-labs-network/airtable', () => ({
  getLabbers: jest.fn(() => mockLabbers),
}));

describe('/api/labbers', () => {
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
    getLabbersHandler(req, res);
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

  it('should get the labbers from AirtableService', () => {
    expect(airtableService.getLabbers).toHaveBeenCalledTimes(1);
    expect(airtableService.getLabbers).toHaveBeenCalledWith();
  });

  describe('and AirtableService successfully retrieves the labbers', () => {
    it('should respond with the provided labbers', () => {
      expect(status).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledTimes(1);
      expect(json).toHaveBeenCalledWith(mockLabbers);
    });
  });

  describe('and AirtableService fails to retrieve the labbers', () => {
    beforeAll(() => {
      jest.spyOn(airtableService, 'getLabbers').mockImplementationOnce(() => {
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
