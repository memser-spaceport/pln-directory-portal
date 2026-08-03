import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { FeatureAgentDemoResponseSchema } from 'libs/contracts/src/schema';
import { FeatureAgentDemoModule } from './feature-agent-demo.module';
import { FeatureAgentDemoService } from './feature-agent-demo.service';

/**
 * The endpoint has no database, cache or auth dependencies, so the test app only
 * boots the feature module instead of the whole `AppModule`.
 */
describe('Feature Agent Demo', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FeatureAgentDemoModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('When getting the feature agent demo payload', () => {
    it('should respond with 200 and a valid schema', async () => {
      const response = await supertest(app.getHttpServer()).get('/feature-agent-demo').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(FeatureAgentDemoResponseSchema.safeParse(response.body).success).toBeTruthy();
    });

    it('should respond with the expected payload', async () => {
      const response = await supertest(app.getHttpServer()).get('/feature-agent-demo').expect(200);

      expect(response.body).toEqual({
        message: 'Hello from autonomous coding agent',
        environment: process.env.NODE_ENV || 'development',
        feature: 'agent-demo',
        timestamp: expect.any(String),
      });
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });

    it('should not require authentication', async () => {
      await supertest(app.getHttpServer()).get('/feature-agent-demo').expect(200);
    });

    it('should delegate to the feature agent demo service', async () => {
      const service = app.get(FeatureAgentDemoService);
      const spy = jest.spyOn(service, 'getDemo');

      await supertest(app.getHttpServer()).get('/feature-agent-demo').expect(200);

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
