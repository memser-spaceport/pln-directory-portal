import { createMock } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma } from 'apps/web-api/prisma/__mocks__';
import fs from 'fs';
import path from 'path';
import * as https from 'https';
import * as client from 'https';
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

  it('should download the file successfully', async () => {
    const url = 'https://example.com/file.jpg';
    const filename = 'file.jpg';

    jest.spyOn(client, 'get').mockImplementation((url, options, callback) => {
      const res = {
        statusCode: 200,
        pipe: jest.fn().mockImplementation((stream) => {
          stream.emit('close');
          return stream;
        }),
        resume: jest.fn(),
      };
      callback!(res as any);
      return { on: jest.fn() };
    });

    // Mocking fs.createWriteStream
    const writeStreamMock = {
      on: jest.fn().mockImplementation((event, handler) => {
        if (event === 'close') {
          handler();
        }
        return writeStreamMock;
      }),
    };
    jest.spyOn(fs, 'createWriteStream').mockReturnValue(writeStreamMock as any);

    // Act
    const result = await fileMigrationService.download(url, filename);

    // Assert
    expect(result).toBe(filename);
    expect(client.get).toHaveBeenCalledWith(
      url,
      { headers: { 'accept-encoding': 'gzip, deflate, br' } },
      expect.any(Function)
    );
    expect(fs.createWriteStream).toHaveBeenCalledWith(filename);
  });
});
