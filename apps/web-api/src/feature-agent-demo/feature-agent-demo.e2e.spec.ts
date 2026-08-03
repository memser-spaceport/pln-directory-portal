import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { FeatureAgentDemoModule } from './feature-agent-demo.module';

describe('Feature agent demo', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FeatureAgentDemoModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror the URI versioning enabled in the main app config:
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('when requesting the /feature-agent-demo endpoint without authentication', () => {
    it('should return a 200 with the expected payload', async () => {
      const response = await supertest(app.getHttpServer()).get('/feature-agent-demo').expect(200);

      expect(response.body).toEqual({
        message: 'Hello from autonomous coding agent',
        environment: process.env.NODE_ENV || 'development',
        feature: 'agent-demo',
        timestamp: expect.any(String),
      });
    });

    it('should return an ISO-8601 UTC timestamp', async () => {
      const response = await supertest(app.getHttpServer()).get('/feature-agent-demo').expect(200);

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });

    it('should also be available on the versioned path', async () => {
      const response = await supertest(app.getHttpServer()).get('/v1/feature-agent-demo').expect(200);

      expect(response.body.message).toBe('Hello from autonomous coding agent');
      expect(response.body.feature).toBe('agent-demo');
    });
  });
});
