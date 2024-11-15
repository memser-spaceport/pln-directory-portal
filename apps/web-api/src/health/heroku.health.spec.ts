import { Test, TestingModule } from '@nestjs/testing';
import { HttpHealthIndicator } from '@nestjs/terminus';
import { HealthCheckError } from '@nestjs/terminus';
import { AxiosResponse } from 'axios';
import { HerokuHealthIndicator } from './heroku.health';

describe('HerokuHealthIndicator', () => {
  let herokuHealthIndicator: HerokuHealthIndicator;
  let httpHealthIndicator: HttpHealthIndicator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HerokuHealthIndicator,
        {
          provide: HttpHealthIndicator,
          useValue: {
            responseCheck: jest.fn(),
          },
        },
      ],
    }).compile();

    herokuHealthIndicator = module.get<HerokuHealthIndicator>(HerokuHealthIndicator);
    httpHealthIndicator = module.get<HttpHealthIndicator>(HttpHealthIndicator);
  });

  describe('isHealthy', () => {
    it('should return healthy status when Heroku status is green', async () => {
      const mockResponse: any = {
        'heroku-status': { status: 'up' },
      };

      // Mocking the successful response
      (httpHealthIndicator.responseCheck as jest.Mock).mockResolvedValue(mockResponse);

      const result = await herokuHealthIndicator.isHealthy();

      // Ensure the expected response structure
      expect(result).toEqual({
        'heroku-status': { status: 'up' },
      });
    });

    it('should throw a HealthCheckError when any Heroku system is not green', async () => {
      const mockResponse: any = {
        status: 200,
        data: {
          status: [
            {
              system: 'system1',
              status: 'green',
            },
            {
              system: 'system2',
              status: 'red', // Simulating a "red" status
            },
          ],
        },
        headers: {},
        config: {},
        request: {},
      };

      // Mocking the responseCheck to resolve with the mocked response
      (httpHealthIndicator.responseCheck as jest.Mock).mockImplementation((name, url, callback) => {
        return callback(mockResponse).then(() => {
          // Simulating the error being thrown when a system is not green
          throw new HealthCheckError('Heroku status check failed', {
            message: 'Heroku system system2 is not green',
            status: 'red',
          });
        });
      });

      // Expecting the HealthCheckError to be thrown
      await expect(herokuHealthIndicator.isHealthy()).rejects.toThrowError(
        new HealthCheckError('Heroku status check failed', {
          message: 'Heroku system system2 is not green',
          status: 'red',
        })
      );
    });

    it('should throw a HealthCheckError when the request fails', async () => {
      // Mocking the HttpHealthIndicator's responseCheck to simulate a failed request
      const mockError = new Error('Heroku status check failed'); // You can use a custom error here
      (httpHealthIndicator.responseCheck as jest.Mock).mockRejectedValue(mockError);

      // Expecting the HealthCheckError to be thrown when the request fails
      await expect(herokuHealthIndicator.isHealthy()).rejects.toThrowError(
        new HealthCheckError('Heroku status check failed', mockError)
      );
    });

    it('should throw a HealthCheckError with the correct message when system status is not green', async () => {
      // Mocking the HttpHealthIndicator's responseCheck to return a "yellow" status
      (httpHealthIndicator.responseCheck as jest.Mock).mockImplementation(async (_, __, checkFn) => {
        // Mock response simulating a status with "yellow" status
        const mockResponse = {
          status: 200,
          data: {
            status: [
              { status: 'green', system: 'system1' },
              { status: 'yellow', system: 'system2' }, // Non-green status
            ],
          },
          config: {},
          headers: {},
          request: {},
        };

        // Call the check function to trigger the HealthCheckError
        return checkFn(mockResponse as AxiosResponse);
      });

      // Expecting the isHealthy method to throw a HealthCheckError
      await expect(herokuHealthIndicator.isHealthy()).rejects.toThrowError(
        new HealthCheckError('Heroku status check failed', {
          message: `Heroku system system2 is not green`,
          status: 'yellow',
        })
      );
    });

    it('should return healthy status if the response status is not 200 but the systems are green', async () => {
      const mockResponse: any = {
        'heroku-status': { status: 'up' },
      };

      // Mocking the response with a non-200 status
      (httpHealthIndicator.responseCheck as jest.Mock).mockResolvedValue(mockResponse);

      // Ensure that the function still returns a healthy status
      const result = await herokuHealthIndicator.isHealthy();
      expect(result).toEqual({
        'heroku-status': { status: 'up' },
      });
    });
  });
});
