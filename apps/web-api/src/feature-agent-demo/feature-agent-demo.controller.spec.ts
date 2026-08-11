import { Test, TestingModule } from '@nestjs/testing';
import { FeatureAgentDemoController } from './feature-agent-demo.controller';
import { FeatureAgentDemoService } from './feature-agent-demo.service';

describe('FeatureAgentDemoController', () => {
  let controller: FeatureAgentDemoController;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeatureAgentDemoController],
      providers: [FeatureAgentDemoService],
    }).compile();

    controller = module.get<FeatureAgentDemoController>(FeatureAgentDemoController);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return the expected demo payload', () => {
    process.env.NODE_ENV = 'test';
    const result = controller.getFeatureAgentDemo();

    expect(result).toMatchObject({
      message: 'Hello from autonomous coding agent v2',
      environment: 'test',
      feature: 'agent-demo',
    });
    expect(typeof result.timestamp).toBe('string');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('should fall back to "development" when NODE_ENV is not set', () => {
    delete process.env.NODE_ENV;
    const result = controller.getFeatureAgentDemo();

    expect(result.environment).toBe('development');
  });

  it('should return the v2 message text', () => {
    const result = controller.getFeatureAgentDemo();

    expect(result.message).toBe('Hello from autonomous coding agent v2');
  });
});
