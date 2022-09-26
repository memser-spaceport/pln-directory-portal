import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MyCacheInterceptor } from './cache.interceptor';

describe('MyCacheInterceptor', () => {
  let interceptor: MyCacheInterceptor;
  let reflectorMock: Reflector;
  let mockExecutionContext: DeepMocked<ExecutionContext>;

  beforeEach(() => {
    mockExecutionContext = createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
        }),
      }),
    });

    reflectorMock = createMock<Reflector>({
      get: () => false,
    });

    interceptor = new MyCacheInterceptor(mockExecutionContext, reflectorMock);
  });
  describe('when receiving a GET request', () => {
    describe('and the requested endpoint is not flagged to be cached', () => {
      it('should be cached', () => {
        expect(
          interceptor.isRequestCacheable(mockExecutionContext)
        ).toBeTruthy();
      });
    });

    describe('and the requested endpoint is flagged to ignore cache', () => {
      it('Should ignore cache', () => {
        reflectorMock = createMock<Reflector>({
          get: () => true,
        });
        interceptor = new MyCacheInterceptor(
          mockExecutionContext,
          reflectorMock
        );
        expect(
          interceptor.isRequestCacheable(mockExecutionContext)
        ).toBeFalsy();
      });
    });
  });

  describe('When received a request other than GET', () => {
    beforeEach(async () => {
      mockExecutionContext = createMock<ExecutionContext>({
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
          }),
        }),
      });
      interceptor = new MyCacheInterceptor(mockExecutionContext, reflectorMock);
    });
    describe('and the requested endpoint is not flagged to ignore cache', () => {
      it('Should ignore cache', () => {
        expect(
          interceptor.isRequestCacheable(mockExecutionContext)
        ).toBeFalsy();
      });
    });
    describe('and the requested endpoint is flagged to ignore cache', () => {
      it('Should ignore cache', () => {
        reflectorMock = createMock<Reflector>({
          get: () => true,
        });
        interceptor = new MyCacheInterceptor(
          mockExecutionContext,
          reflectorMock
        );
        expect(
          interceptor.isRequestCacheable(mockExecutionContext)
        ).toBeFalsy();
      });
    });
  });
});
