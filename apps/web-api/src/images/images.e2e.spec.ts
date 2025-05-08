import { createMock } from '@golevelup/ts-jest';
import { CACHE_MANAGER, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Cache } from 'cache-manager';
import {
  ResponseCreateImageSchema,
  ResponseImageSchema,
} from 'libs/contracts/src/schema';
import supertest from 'supertest';
import { AppModule } from '../app.module';
import { mainConfig } from '../main.config';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { createImage } from './__mocks__/images.mocks';
import { ImagesModule } from './images.module';

jest.mock('web3.storage');

describe.skip('Images', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ImagesModule],
      providers: [
        {
          provide: FileUploadService,
          useValue: createMock<FileUploadService>(),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    cacheManager = moduleRef.get<Cache>(CACHE_MANAGER);

    // Load main app config:
    mainConfig(app);
    const fileUploadService = app.get(FileUploadService);
    fileUploadService.storeFiles = jest.fn().mockResolvedValue('cid');
    await app.init();
    await cacheManager.reset();
    await createImage({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('When getting', () => {
    describe('all Images', () => {
      it('should list all the Images with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/images')
          .expect(200);
        const images = response.body;
        expect(images).toHaveLength(5);
        const hasValidSchema =
          ResponseImageSchema.array().safeParse(images).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
    describe('an image by uid', () => {
      it('should return the image with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/images/uid-1')
          .expect(200);
        const image = response.body;
        const hasValidSchema = ResponseImageSchema.safeParse(image).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
    describe('an image by uid that does not exist', () => {
      it('should return a 404', async () => {
        await supertest(app.getHttpServer())
          .get('/v1/images/uid-6')
          .expect(404);
      });
    });
    describe('undustry image with an uid with only numbers', () => {
      it('should return a 404', async () => {
        await supertest(app.getHttpServer()).get('/v1/images/123').expect(404);
      });
    });

    describe('image by uid with valid character and special characters', () => {
      it('should return a 404', async () => {
        await supertest(app.getHttpServer())
          .get('/v1/images/%7Bfoo:"bar"%7D')
          .expect(404);
      });
    });
  });

  describe('When uploading a file', () => {
    it('Should return the original image with a valid schema', async () => {
      // Get the csrf token
      const token = await supertest(app.getHttpServer()).get('/token');
      // Get the cookie from the response
      const cookie = token.get('Set-Cookie');
      const response = await supertest(app.getHttpServer())
        .post('/v1/images')
        .attach('file', `${__dirname}/__mocks__/images/250-width-test.png`)
        .set('Cookie', cookie)
        .set('csrf-token', `${token.body.token}`)
        .expect(201);
      const image = response.body;
      const hasValidSchema = ResponseCreateImageSchema.safeParse(image).success;
      expect(hasValidSchema).toBeTruthy();
    });
    it('Should create 1 thumbnail when the image is bigger than 78px wide', async () => {
      // Get the csrf token
      const token = await supertest(app.getHttpServer()).get('/token');
      // Get the cookie from the response
      const cookie = token.get('Set-Cookie');
      const response = await supertest(app.getHttpServer())
        .post('/v1/images')
        .attach('file', `${__dirname}/__mocks__/images/250-width-test.png`)
        .set('Cookie', cookie)
        .set('csrf-token', `${token.body.token}`)
        .expect(201);
      const image = response.body.image;
      expect(image.thumbnails.length).toBe(1);
    });
    it('Should create 2 thumbnails when the image is bigger than 256px wide', async () => {
      // Get the csrf token
      const token = await supertest(app.getHttpServer()).get('/token');
      // Get the cookie from the response
      const cookie = token.get('Set-Cookie');
      const response = await supertest(app.getHttpServer())
        .post('/v1/images')
        .attach('file', `${__dirname}/__mocks__/images/500-width-test.png`)
        .set('Cookie', cookie)
        .set('csrf-token', `${token.body.token}`)
        .expect(201);
      const image = response.body.image;
      expect(image.thumbnails.length).toBe(2);
    });
    it('Should create 3 thumbnails when the image is bigger than 512px wide', async () => {
      // Get the csrf token
      const token = await supertest(app.getHttpServer()).get('/token');
      // Get the cookie from the response
      const cookie = token.get('Set-Cookie');
      const response = await supertest(app.getHttpServer())
        .post('/v1/images')
        .attach('file', `${__dirname}/__mocks__/images/1000-width-test.png`)
        .set('Cookie', cookie)
        .set('csrf-token', `${token.body.token}`)
        .expect(201);
      const image = response.body.image;
      expect(image.thumbnails.length).toBe(3);
    });
    it('Should create 4 thumbnails when the image is bigger than 1500px wide', async () => {
      // Get the csrf token
      const token = await supertest(app.getHttpServer()).get('/token');
      // Get the cookie from the response
      const cookie = token.get('Set-Cookie');
      const response = await supertest(app.getHttpServer())
        .post('/v1/images')
        .attach('file', `${__dirname}/__mocks__/images/2000-width-test.png`)
        .set('Cookie', cookie)
        .set('csrf-token', `${token.body.token}`)
        .expect(201);
      const image = response.body.image;
      expect(image.thumbnails.length).toBe(4);
    });
  });
});
