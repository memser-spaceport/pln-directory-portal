import { ExecutionContext } from '@nestjs/common';
import { ConcealEntityIDInterceptor } from './conceal-entity-id.interceptor';

jest.mock('@nestjs/common');
jest.mock('rxjs');
jest.mock('rxjs/operators', () => ({
  map: jest.fn((data) => data),
}));

const mockRequest = {
  method: 'GET',
  url: '/example',
  headers: {},
};

describe('ConcealEntityIDInterceptor', () => {
  let concealEntityIDInterceptor: ConcealEntityIDInterceptor;

  const contextMock = {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
  } as ExecutionContext;

  const getNextMock = jest.fn(function (data) {
    return {
      handle: jest.fn().mockReturnThis(),
      pipe: jest.fn((callback) => callback(data)),
    };
  });

  beforeEach(() => {
    concealEntityIDInterceptor = new ConcealEntityIDInterceptor();
  });

  describe('when delivering an API response', () => {
    describe('and the response is just a string', () => {
      it('should not conceal ids', () => {
        const responseData = 'String with id: 123';
        const finalResponse = concealEntityIDInterceptor.intercept(contextMock, getNextMock(responseData));
        expect(finalResponse).toBe(responseData);
      });
    });

    describe('and the response is just a number', () => {
      it('should not conceal ids', () => {
        const responseData = 123;
        const finalResponse = concealEntityIDInterceptor.intercept(contextMock, getNextMock(responseData));
        expect(finalResponse).toBe(responseData);
      });
    });

    describe('and the response is an object', () => {
      describe("and the object hasn't ids", () => {
        it("shouldn't conceal ids", () => {
          const responseData = {
            uid: 123,
            nested: {
              uid: '123',
            },
          };
          const finalResponse = concealEntityIDInterceptor.intercept(contextMock, getNextMock(responseData));
          expect(finalResponse).toStrictEqual(responseData);
        });
      });
      describe('and the object has ids', () => {
        it('should conceal ids', () => {
          const responseData = {
            id: 123,
            nested: {
              id: '123',
            },
          };
          const finalResponse = concealEntityIDInterceptor.intercept(contextMock, getNextMock(responseData));
          expect(finalResponse).toStrictEqual({
            nested: {},
          });
        });
      });
    });

    describe('and the response is an array with objects', () => {
      describe("and the objects don't have ids", () => {
        it("shouldn't conceal ids", () => {
          const responseData = [
            {
              uid: 123,
              nested: {
                uid: '123',
              },
            },
            {
              uid: 123,
              nested: {
                uid: '123',
              },
            },
          ];
          const finalResponse = concealEntityIDInterceptor.intercept(contextMock, getNextMock(responseData));
          expect(finalResponse).toStrictEqual(responseData);
        });
      });
      describe('and the objects have ids', () => {
        it('should conceal ids', () => {
          const responseData = [
            {
              id: 123,
              nested: {
                id: '123',
              },
            },
            {
              id: 123,
              nested: {
                id: '123',
              },
            },
          ];
          const finalResponse = concealEntityIDInterceptor.intercept(contextMock, getNextMock(responseData));
          expect(finalResponse).toStrictEqual([
            {
              nested: {},
            },
            {
              nested: {},
            },
          ]);
        });
      });
    });
  });
});
