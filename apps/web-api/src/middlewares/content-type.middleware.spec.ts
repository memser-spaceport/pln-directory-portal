import { createMock } from '@golevelup/ts-jest';
import { Response } from 'express';
import { NextFunction } from 'express-serve-static-core';
import { ContentTypeMiddleware } from './content-type.middleware';

describe('Content-Type Middleware', () => {
  let middleware: ContentTypeMiddleware;
  let next: NextFunction;
  let mockRes: Response;

  beforeEach(() => {
    middleware = new ContentTypeMiddleware();
    next = jest.fn();
    mockRes = createMock<Response>();
  });

  describe('when the content-type is not application/json', () => {
    it('should return a 415 status code', () => {
      const req = {
        headers: {
          'content-type': 'text/plain',
        },
      } as any;

      middleware.use(req, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(415);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('when the content-type is application/json', () => {
    it('should continue to the next middleware', () => {
      const req = {
        headers: {
          'content-type': 'application/json',
        },
      } as any;

      middleware.use(req, mockRes, next);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.send).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });
});
