import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { ApiInfoModule } from './api-info.module';
import { ApiInfoResponseSchema } from './api-info.schema';
import { API_INFO_SERVICE_NAME, DEFAULT_ENVIRONMENT } from './api-info.constants';

describe('Api Info', () => {
  let app: INestApplication;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiInfoModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors the app-wide URI versioning from `mainConfig`, to prove the
    // endpoint stays reachable unversioned at `/api-info`.
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  describe('when requesting GET /api-info without authentication', () => {
    it('should respond 200 with a payload matching the schema', async () => {
      const response = await supertest(app.getHttpServer()).get('/api-info').expect(200);

      expect(ApiInfoResponseSchema.safeParse(response.body).success).toBeTruthy();
      expect(response.body.service).toBe(API_INFO_SERVICE_NAME);
      expect(typeof response.body.version).toBe('string');
      expect(Number.isInteger(response.body.uptimeSeconds)).toBe(true);
      expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(response.body.timestamp).toBe(new Date(response.body.timestamp).toISOString());
    });

    it('should respond as JSON', async () => {
      await supertest(app.getHttpServer()).get('/api-info').expect(200).expect('Content-Type', /application\/json/);
    });

    it('should report the environment from NODE_ENV', async () => {
      process.env.NODE_ENV = 'staging';

      const response = await supertest(app.getHttpServer()).get('/api-info').expect(200);

      expect(response.body.environment).toBe('staging');
    });

    it('should fall back to development when NODE_ENV is not set', async () => {
      delete process.env.NODE_ENV;

      const response = await supertest(app.getHttpServer()).get('/api-info').expect(200);

      expect(response.body.environment).toBe(DEFAULT_ENVIRONMENT);
    });

    it('should not be reachable under the versioned /v1 prefix', async () => {
      await supertest(app.getHttpServer()).get('/v1/api-info').expect(404);
    });
  });
});
