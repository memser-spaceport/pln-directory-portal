import { Test, TestingModule } from '@nestjs/testing';
import { OsoCodeMetricsByProjectV1Controller } from './oso_code-metrics-by-project-v1.controller';
import { OsoCodeMetricsByProjectV1Service } from './oso_code-metrics-by-project-v1.service';

describe('OsoCodeMetricsByProjectV1Controller', () => {
  let controller: OsoCodeMetricsByProjectV1Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OsoCodeMetricsByProjectV1Controller],
      providers: [OsoCodeMetricsByProjectV1Service],
    }).compile();

    controller = module.get<OsoCodeMetricsByProjectV1Controller>(OsoCodeMetricsByProjectV1Controller);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
