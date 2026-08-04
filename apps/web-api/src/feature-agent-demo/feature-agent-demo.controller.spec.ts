import { Test, TestingModule } from '@nestjs/testing';
import { FeatureAgentDemoController } from './feature-agent-demo.controller';
import { FeatureAgentDemoService } from './feature-agent-demo.service';

describe('FeatureAgentDemoController', () => {
  let controller: FeatureAgentDemoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeatureAgentDemoController],
      providers: [FeatureAgentDemoService],
    }).compile();

    controller = module.get<FeatureAgentDemoController>(FeatureAgentDemoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate to the service and return its payload', () => {
    const result = controller.getDemo();
    expect(result).toEqual({
      message: 'Hello from autonomous coding agent',
      environment: process.env.NODE_ENV || 'development',
      feature: 'agent-demo',
      timestamp: expect.any(String),
    });
  });
});
