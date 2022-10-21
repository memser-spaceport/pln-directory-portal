import { createMock } from '@golevelup/ts-jest';
import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { NotFoundInterceptor } from './not-found-interceptor';

jest.mock('rxjs', () => ({
  tap: jest.fn((data) => data),
}));

describe('NotFoundInterceptor', () => {
  let notFoundInterceptor: NotFoundInterceptor;
  let contextMock;
  const getNextMock = jest.fn(function (data) {
    return {
      handle: jest.fn().mockReturnThis(),
      pipe: jest.fn((callback) => callback(data)),
    };
  });

  beforeEach(() => {
    contextMock = createMock<ExecutionContext>();
    notFoundInterceptor = new NotFoundInterceptor();
  });

  describe('when delivering an API response', () => {
    describe('and the response is not null', () => {
      it('should not throw NotFoundException', () => {
        const responseData = 'String with id: 123';
        const finalResponse = notFoundInterceptor.intercept(
          contextMock,
          getNextMock(responseData)
        );
        expect(finalResponse).toBe(responseData);
      });
    });
    describe('and the response is null', () => {
      it('should throw NotFoundException', () => {
        const responseData = null;
        try {
          notFoundInterceptor.intercept(contextMock, getNextMock(responseData));
        } catch (error) {
          expect(error).toBeInstanceOf(NotFoundException);
        }
      });
    });
  });
});
