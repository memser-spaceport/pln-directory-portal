import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { INestApplication } from '@nestjs/common';
import { ResponseAcceleratorProgramSchema } from 'libs/contracts/src/schema/accelerator-program';
import { createAcceleratorProgram } from './__mocks__/accelerator-programs.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';

describe('Accelerator programs', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createAcceleratorProgram({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('When getting all accelerator programs', () => {
    it('should list all the accelerator programs with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/accelerator-programs')
        .expect(200);
      const acceleratorPrograms = response.body;
      expect(acceleratorPrograms).toHaveLength(5);
      const hasValidSchema =
        ResponseAcceleratorProgramSchema.array().safeParse(
          acceleratorPrograms
        ).success;
      expect(hasValidSchema).toBeTruthy();
    });

    describe('and with an invalid query param', () => {
      it('should list all the accelerator programs with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/accelerator-programs?invalid=true')
          .expect(200);
        const acceleratorPrograms = response.body;
        expect(acceleratorPrograms).toHaveLength(5);
        const hasValidSchema =
          ResponseAcceleratorProgramSchema.array().safeParse(
            acceleratorPrograms
          ).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });

    describe('and with a valid query param', () => {
      it('should list filtered accelerator programs with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/accelerator-programs?title=Accelerator+Program+1')
          .expect(200);
        const acceleratorPrograms = response.body;
        expect(acceleratorPrograms).toHaveLength(1);
        const hasValidSchema =
          ResponseAcceleratorProgramSchema.array().safeParse(
            acceleratorPrograms
          ).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
  });
  describe('When getting an accelerator program by uid', () => {
    it('should return the accelerator program with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/accelerator-programs/uid-1')
        .expect(200);
      const acceleratorProgram = response.body;
      const hasValidSchema =
        ResponseAcceleratorProgramSchema.safeParse(acceleratorProgram).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });
  describe('When getting an accelerator program by uid that does not exist', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/accelerator-programs/uid-6')
        .expect(404);
    });
  });
  describe('When getting an accelerator program with an uid with only numbers', () => {
    it('should return a 400', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/accelerator-programs/123')
        .expect(404);
    });
  });
  describe('When getting a accelerator program by uid with valid characters and special characters', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/accelerator-programs/%7Bfoo:"bar"%7D')
        .expect(404);
    });
  });
});
