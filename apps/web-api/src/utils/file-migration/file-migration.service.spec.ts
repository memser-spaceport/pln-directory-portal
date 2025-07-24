import { createMock } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma } from 'apps/web-api/prisma/__mocks__';
import fs from 'fs';
import path from 'path';
import { ImagesController } from '../../images/images.controller';
import { ImagesService } from '../../images/images.service';
import { PrismaService } from '../../shared/prisma.service';
import { FileEncryptionService } from '../file-encryption/file-encryption.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { hashFileName } from '../hashing';
import { FileMigrationService } from './file-migration.service';
jest.spyOn(fs, 'readFileSync').mockImplementation(() => 'readFileSync');
jest.spyOn(fs, 'createWriteStream').mockImplementation();
jest.spyOn(fs, 'unlink').mockImplementation();
jest.spyOn(fs, 'createReadStream').mockImplementation();
jest.spyOn(path, 'parse').mockImplementation(() => {
  return {
    dir: 'dir',
    name: 'test',
    ext: 'png',
    root: 'root',
    base: 'base',
  };
});
jest.mock('sharp', () =>
  jest.fn(() => ({
    toFormat: jest.fn().mockImplementation(() => ({
      toFile: jest.fn().mockImplementation(() => ({
        format: 'webp',
      })),
    })),
  }))
);
describe('FileMigrationService', () => {
  let fileMigrationService: FileMigrationService;
  let imagesController: ImagesController;
  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      providers: [
        FileMigrationService,
        PrismaService,
        {
          provide: FileUploadService,
          useValue: createMock<FileUploadService>(),
        },
        {
          provide: FileEncryptionService,
          useValue: createMock<FileEncryptionService>(),
        },
        { provide: ImagesController, useValue: createMock<ImagesController>() },
        { provide: ImagesService, useValue: createMock<ImagesService>() },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    fileMigrationService = app.get<FileMigrationService>(FileMigrationService);
    imagesController = app.get<ImagesController>(ImagesController);
    jest.spyOn(imagesController, 'uploadImage').mockImplementation(() => {
      return Promise.resolve({
        image: {
          cid: 'cid',
          filename: 'filename',
          size: 1,
          type: 'type',
          width: 1,
          height: 1,
          url: 'url',
          uid: 'uid',
          version: 'LARGE',
          id: 1,
          createdAt: new Date(),
          thumbnails: [],
          thumbnailToUid: null,
          updatedAt: new Date(),
        },
      });
    });
    jest.spyOn(fileMigrationService, 'download').mockImplementation(() => {
      return Promise.resolve();
    });
  });
  describe('When receiving a file', () => {
    it('Should call uploadImage with a valid image', async () => {
      const airtableImage = {
        id: 'rec1',
        url: 'https://dl.airtable.com/.attachments/test.png',
        filename: 'test.png',
        size: 1,
        type: 'image/png',
        width: 1,
        height: 1,
      };
      const hashedFileName = `${hashFileName(
        `${path.parse('test.png').name}-rec1`
      )}.webp`;
      await fileMigrationService.migrateFile(airtableImage);
      expect(imagesController.uploadImage).toHaveBeenCalledWith(
        {
          filename: hashedFileName,
          mimetype: 'image/png',
          encoding: '7bit',
          buffer: 'readFileSync',
          destination: '',
          fieldname: 'file',
          originalname: hashedFileName,
          path: `./${hashedFileName}`,
          size: 1,
          stream: undefined,
        },
        { needsToHashFilename: false }
      );
    });
    it('Should return status if file type is not suported', async () => {
      const airtableImage = {
        id: 'rec1',
        url: 'https://dl.airtable.com/.attachments/test.png',
        filename: '1',
        size: 1,
        type: 'image/unsupported',
        width: 1,
        height: 1,
      };
      const result = await fileMigrationService.migrateFile(airtableImage);
      expect(result).toEqual({ status: 'File type not supported' });
    });
    it('Should throw error if the download fails', async () => {
      const airtableImage = {
        id: 'rec1',
        url: 'https://dl.airtable.com/.attachments/test.png',
        filename: '1',
        size: 1,
        type: 'image/png',
        width: 1,
        height: 1,
      };
      jest
        .spyOn(fileMigrationService, 'download')
        .mockImplementation((uri, filename) => {
          return Promise.reject();
        });
      await expect(
        fileMigrationService.migrateFile(airtableImage)
      ).rejects.toThrow();
    });
    it('Should throw error if the upload fails', async () => {
      const airtableImage = {
        id: 'rec1',
        url: 'https://dl.airtable.com/.attachments/test.png',
        filename: '1',
        size: 1,
        type: 'image/png',
        width: 1,
        height: 1,
      };
      jest.spyOn(imagesController, 'uploadImage').mockImplementation(() => {
        return Promise.reject();
      });
      await expect(
        fileMigrationService.migrateFile(airtableImage)
      ).rejects.toThrow();
    });
  });
});
