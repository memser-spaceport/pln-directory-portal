import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { FeatureAgentDemoModule } from './feature-agent-demo.module';
import { mainConfig } from '../main.config';

describe('Feature Agent Demo', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FeatureAgentDemoModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Load the main app config so URI versioning/middlewares match production.
    mainConfig(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('when requesting GET /feature-agent-demo without authentication', () => {
    it('should return 200 with the demo payload', async () => {
      const response = await supertest(app.getHttpServer()).get('/feature-agent-demo').expect(200);

      expect(response.body).toEqual({
        message: 'Hello from autonomous coding agent',
        environment: process.env.NODE_ENV || 'development',
        feature: 'agent-demo',
        timestamp: expect.any(String),
      });
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });

    it('should return JSON', async () => {
      await supertest(app.getHttpServer()).get('/feature-agent-demo').expect(200).expect('Content-Type', /json/);
    });

    it('should not support other HTTP verbs', async () => {
      await supertest(app.getHttpServer()).post('/feature-agent-demo').expect(404);
    });
  });
});
