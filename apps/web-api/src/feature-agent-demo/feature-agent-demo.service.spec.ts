import { Test, TestingModule } from '@nestjs/testing';
import { FeatureAgentDemoResponseSchema } from 'libs/contracts/src/schema';
import { FeatureAgentDemoService } from './feature-agent-demo.service';

describe('FeatureAgentDemoService', () => {
  let service: FeatureAgentDemoService;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeatureAgentDemoService],
    }).compile();

    service = module.get<FeatureAgentDemoService>(FeatureAgentDemoService);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should return the demo payload with a valid schema', () => {
    const result = service.getDemo();

    expect(FeatureAgentDemoResponseSchema.safeParse(result).success).toBeTruthy();
    expect(result.message).toBe('Hello from autonomous coding agent');
    expect(result.feature).toBe('agent-demo');
  });

  it('should expose the environment from NODE_ENV', () => {
    process.env.NODE_ENV = 'staging';

    expect(service.getDemo().environment).toBe('staging');
  });

  it('should fall back to development when NODE_ENV is not set', () => {
    delete process.env.NODE_ENV;

    expect(service.getDemo().environment).toBe('development');
  });

  it('should stamp the payload with the current ISO-8601 UTC timestamp', () => {
    const before = Date.now();
    const { timestamp } = service.getDemo();
    const after = Date.now();

    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = new Date(timestamp).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
