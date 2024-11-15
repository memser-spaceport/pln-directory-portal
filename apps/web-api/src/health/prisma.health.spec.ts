import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../shared/prisma.service';
import { HealthCheckError } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';

describe('PrismaHealthIndicator', () => {
  let prismaHealthIndicator: PrismaHealthIndicator;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaHealthIndicator,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn(), // Mocking the $queryRaw method
          },
        },
      ],
    }).compile();

    prismaHealthIndicator = module.get<PrismaHealthIndicator>(PrismaHealthIndicator);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('isHealthy', () => {
    it('should return healthy status when Prisma query is successful', async () => {
      // Mocking the successful query execution
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue(true); 

      const result = await prismaHealthIndicator.isHealthy('prisma');

      expect(result).toEqual({
        prisma: { status: 'up' }, // This is what getStatus(key, true) would return
      });
      expect(prismaService.$queryRaw).toHaveBeenCalledWith(['SELECT 1']);
    });

    it('should throw a HealthCheckError when Prisma query fails', async () => {
      // Mocking the failure of the query
      (prismaService.$queryRaw as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(prismaHealthIndicator.isHealthy('prisma'))
        .rejects
        .toThrowError(HealthCheckError);
      await expect(prismaHealthIndicator.isHealthy('prisma'))
        .rejects
        .toThrowError('Prisma check failed');
    });
  });
});
