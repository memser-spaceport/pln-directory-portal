import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AcceleratorProgramSchema } from 'libs/contracts/src/schema/accelerator-program';
import supertest from 'supertest';
import { mainConfig } from '../main.config';
import { AcceleratorProgramsModule } from './accelerator-programs.module';
import { createAcceleratorProgram } from './__mocks__/accelerator-programs.mocks';

describe('Accelerator programs', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AcceleratorProgramsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    mainConfig(app);
    await app.init();

    await createAcceleratorProgram({ amount: 5 });
  });

  describe('When getting all accelerator programs', () => {
    it('should list all the accelerator programs with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/accelerator-programs')
        .expect(200);
      const acceleratorPrograms = response.body;
      expect(acceleratorPrograms).toHaveLength(5);
      const hasValidSchema =
        AcceleratorProgramSchema.array().safeParse(acceleratorPrograms).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });
  describe('When getting an accelerator program by uid', () => {
    it('should return the accelerator program with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/accelerator-programs/uid-1')
        .expect(200);
      const acceleratorProgram = response.body;
      const hasValidSchema =
        AcceleratorProgramSchema.safeParse(acceleratorProgram).success;
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
