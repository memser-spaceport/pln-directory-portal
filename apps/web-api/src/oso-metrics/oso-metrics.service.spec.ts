import { Test, TestingModule } from '@nestjs/testing';
import { OsoMetricsService } from './oso-metrics.service';

describe('OsoMetricsService', () => {
  let service: OsoMetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OsoMetricsService],
    }).compile();

    service = module.get<OsoMetricsService>(OsoMetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
