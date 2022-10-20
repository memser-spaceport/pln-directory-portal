import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundExceptionFilter } from './not-found-exception.filter';

const mockJson = jest.fn();
const mockStatus = jest.fn().mockImplementation(() => ({
  json: mockJson,
}));
const mockGetResponse = jest.fn().mockImplementation(() => ({
  status: mockStatus,
}));
const mockHttpArgumentsHost = jest.fn().mockImplementation(() => ({
  getResponse: mockGetResponse,
  getRequest: jest.fn(),
}));

const mockArgumentsHost = {
  switchToHttp: mockHttpArgumentsHost,
  getArgByIndex: jest.fn(),
  getArgs: jest.fn(),
  getType: jest.fn(),
  switchToRpc: jest.fn(),
  switchToWs: jest.fn(),
};

describe('Not found exception filter', () => {
  let service: NotFoundExceptionFilter;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotFoundExceptionFilter],
    }).compile();
    service = module.get<NotFoundExceptionFilter>(NotFoundExceptionFilter);
  });

  describe('When it catches a NotfoundError', () => {
    it('Should return a 404 with a Not Found error message', () => {
      service.catch(
        new HttpException('Http exception', HttpStatus.NOT_FOUND),
        mockArgumentsHost
      );
      expect(mockHttpArgumentsHost).toBeCalledTimes(1);
      expect(mockHttpArgumentsHost).toBeCalledWith();
      expect(mockGetResponse).toBeCalledTimes(1);
      expect(mockGetResponse).toBeCalledWith();
      expect(mockStatus).toBeCalledTimes(1);
      expect(mockStatus).toBeCalledWith(HttpStatus.NOT_FOUND);
      expect(mockJson).toBeCalledTimes(1);
      expect(mockJson).toBeCalledWith({
        statusCode: 404,
        error: 'Not Found',
      });
    });
  });
});
