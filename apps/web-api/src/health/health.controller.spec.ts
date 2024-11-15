import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthCheckService, HealthCheckResult, HttpHealthIndicator } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { HerokuHealthIndicator } from './heroku.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;
  let prismaHealthIndicator: PrismaHealthIndicator;
  let herokuHealthIndicator: HerokuHealthIndicator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthCheckService,
        HttpHealthIndicator,
        PrismaHealthIndicator,
        HerokuHealthIndicator,
      ],
    })
      .overrideProvider(HealthCheckService)
      .useValue({
        check: jest.fn(),
      })
      .overrideProvider(PrismaHealthIndicator)
      .useValue({
        isHealthy: jest.fn(),
      })
      .overrideProvider(HerokuHealthIndicator)
      .useValue({
        isHealthy: jest.fn(),
      })
      .compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
    prismaHealthIndicator = module.get<PrismaHealthIndicator>(PrismaHealthIndicator);
    herokuHealthIndicator = module.get<HerokuHealthIndicator>(HerokuHealthIndicator);
  });

  it('should return healthy status when all indicators are healthy', async () => {
    const mockHealthResult: HealthCheckResult = {
      status: 'ok',
      details: {
        heroku: { status: 'up' },
        prisma: { status: 'up' },
      },
    };

    // Mock each health indicator to return a healthy status
    jest.spyOn(healthCheckService, 'check').mockResolvedValue(mockHealthResult);

    const result = await controller.healthCheck();
    expect(result).toEqual(mockHealthResult);
  });

  it('should return unhealthy status if any indicator fails', async () => {
    const mockUnhealthyResult: HealthCheckResult = {
      status: 'error',
      details: {
        heroku: { status: 'down', message: 'Heroku is down' },
        prisma: { status: 'up' },
      },
    };

    // Mock the health check service to return an unhealthy result
    jest.spyOn(healthCheckService, 'check').mockResolvedValue(mockUnhealthyResult);

    const result = await controller.healthCheck();
    expect(result).toEqual(mockUnhealthyResult);
  });
});
