import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Define the RequestIp decorator
export const RequestIp = createParamDecorator((data: unknown, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest();
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
});

describe('RequestIp Decorator', () => {
  it('should return the x-forwarded-for header if it exists', () => {
    const mockRequest = {
      headers: {
        'x-forwarded-for': '123.45.67.89',
      },
      connection: {
        remoteAddress: '98.76.54.32', // This should not be returned
      },
    };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext; // Type assertion to satisfy TypeScript

    // Call the decorator as it would be called in a real scenario
    const result = RequestIp('', mockContext); // Provide an empty string
    expect(result).toBe('123.45.67.89'); // Check the returned value
  });

  it('should return remoteAddress if x-forwarded-for header does not exist', () => {
    const mockRequest = {
      headers: {},
      connection: {
        remoteAddress: '98.76.54.32',
      },
    };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext; // Type assertion to satisfy TypeScript

    // Call the decorator as it would be called in a real scenario
    const result = RequestIp('', mockContext); // Provide an empty string
    expect(result).toBe('98.76.54.32'); // Check the returned value
  });
});
