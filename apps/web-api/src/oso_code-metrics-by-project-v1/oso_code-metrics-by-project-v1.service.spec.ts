import { Test, TestingModule } from '@nestjs/testing';
import { OsoCodeMetricsByProjectV1Service } from './oso_code-metrics-by-project-v1.service';

describe('OsoCodeMetricsByProjectV1Service', () => {
  let service: OsoCodeMetricsByProjectV1Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OsoCodeMetricsByProjectV1Service],
    }).compile();

    service = module.get<OsoCodeMetricsByProjectV1Service>(OsoCodeMetricsByProjectV1Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
