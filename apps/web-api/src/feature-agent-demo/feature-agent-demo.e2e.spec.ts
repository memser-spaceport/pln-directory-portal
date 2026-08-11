import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { FeatureAgentDemoModule } from './feature-agent-demo.module';

describe('FeatureAgentDemo (e2e)', () => {
  let app: INestApplication;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FeatureAgentDemoModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    await app.close();
  });

  it('should return 200 with the expected JSON payload without any authentication', async () => {
    process.env.NODE_ENV = 'staging';

    const response = await supertest(app.getHttpServer())
      .get('/feature-agent-demo')
      .expect(200);

    expect(response.body).toEqual({
      message: 'Hello from autonomous coding agent',
      environment: 'staging',
      feature: 'agent-demo',
      timestamp: expect.any(String),
    });
    // Timestamp must be a valid ISO-8601 UTC string.
    expect(response.body.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it('should default environment to "development" when NODE_ENV is unset', async () => {
    delete process.env.NODE_ENV;

    const response = await supertest(app.getHttpServer())
      .get('/feature-agent-demo')
      .expect(200);

    expect(response.body.environment).toBe('development');
  });
});
