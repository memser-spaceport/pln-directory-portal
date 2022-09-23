import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { AppController } from './app.controller';
import { AppModule } from './app.module';
import { mainConfig } from './main.config';

describe('App', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AppController],
    }).compile();
    app = moduleRef.createNestApplication();
    mainConfig(app);
    await app.init();
  });

  describe('when requesting the /token endpoint', () => {
    it('should retrieve a CSRF token', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/token')
        .expect(200);
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
    });
  });
});
