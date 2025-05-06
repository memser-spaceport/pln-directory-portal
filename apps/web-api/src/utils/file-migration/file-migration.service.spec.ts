import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as client from 'https';
import { ImagesController } from '../../images/images.controller';
import { FileMigrationService } from './file-migration.service';
import { IAirtableImage } from '@protocol-labs-network/airtable';
import * as path from 'path';
import { hashFileName } from '../hashing';
import { ImageSize } from '@prisma/client';

// Mocking external dependencies
jest.mock('fs');
jest.mock('https');
jest.mock('path');
jest.mock('../hashing');

describe('FileMigrationService', () => {
  let service: FileMigrationService;
  let imagesController: ImagesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileMigrationService, { provide: ImagesController, useValue: { uploadImage: jest.fn() } }],
    }).compile();

    service = module.get<FileMigrationService>(FileMigrationService);
    imagesController = module.get<ImagesController>(ImagesController);

    // Mocking fs and path methods
    jest.spyOn(fs, 'readFileSync').mockReturnValue('mockBuffer');
    jest.spyOn(fs, 'createWriteStream').mockReturnValue({
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') callback();
        return { on: jest.fn() };
      }),
    } as any);
    jest.spyOn(fs, 'unlink').mockImplementation((_, callback) => callback(null));
    jest.spyOn(path, 'parse').mockReturnValue({ name: 'mockedName' } as any);

    // Mock hashFileName
    (hashFileName as jest.Mock).mockReturnValue('hashed-filename');
  });

  describe('migrateFile', () => {
    const airtableImage: IAirtableImage = {
      id: '1',
      url: 'https://example.com/image.png',
      size: 12345,
      type: 'image/png',
      filename: 'image.png',
      width: 500,
      height: 500,
    };
    it('should migrate the file successfully', async () => {
      // Mock https.get
      (client.get as jest.Mock).mockImplementation((url, options, callback) => {
        const res = {
          statusCode: 200,
          pipe: jest.fn().mockImplementation((stream) => {
            stream.emit('close');
            return stream;
          }),
          resume: jest.fn(),
        };
        callback(res);
        return { on: jest.fn() };
      });

      // Mock uploadImage
      jest.spyOn(imagesController, 'uploadImage').mockResolvedValue({
        image: {
          id: 1,
          uid: 'uid',
          cid: 'cid',
          width: 1920,
          height: 1080,
          url: 'https://example.com/image.webp',
          filename: 'sample-image.webp',
          size: 1000,
          type: 'image/webp',
          version: ImageSize.LARGE,
          thumbnailToUid: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          thumbnails: [],
        },
      });
      const newFile = {
        path: './uploads/image.webp',
        size: 1024000,
        filename: 'hashed-file-name.webp',
        buffer: fs.readFileSync('./uploads/image.webp'),
        destination: './uploads',
        fieldname: 'file',
        mimetype: 'image/webp',
        originalname: 'original-file-name.webp',
        stream: fs.createReadStream('./uploads/image.webp'),
        encoding: '7bit',
      };

      // Act
      const result = await service.migrateFile(airtableImage);
      // Assert
      expect(client.get).toHaveBeenCalledWith(
        airtableImage.url,
        { headers: { 'accept-encoding': 'gzip, deflate, br' } },
        expect.any(Function)
      );
      expect(fs.readFileSync).toHaveBeenCalledWith('./hashed-filename');
      expect(imagesController.uploadImage).toHaveBeenCalledWith(newFile, { needsToHashFilename: false });
      expect(result).toEqual({ id: '1', url: 'mocked-url' });
    });

    it('should return error when file type is not supported', async () => {
      const invalidImage = { ...airtableImage, type: 'application/pdf' };

      const result = await service.migrateFile(invalidImage);

      expect(result).toEqual({ status: 'File type not supported' });
    });

    it('should return error when file is not an image', async () => {
      const invalidImage = { ...airtableImage, width: 0, height: 0 };

      const result = await service.migrateFile(invalidImage);

      expect(result).toEqual({ status: 'File is not an image' });
    });

    it('should throw an error if download fails', async () => {
      // Mock https.get to simulate a failure
      (client.get as jest.Mock).mockImplementation((url, options, callback) => {
        const res = { statusCode: 404, resume: jest.fn() };
        callback(res);
        return { on: jest.fn() };
      });

      await expect(service.migrateFile(airtableImage)).rejects.toThrow(
        'Failed downloading the image - Error: Request Failed With a Status Code: 404'
      );
    });

    it('should throw an error if upload fails', async () => {
      // Mock https.get
      (client.get as jest.Mock).mockImplementation((url, options, callback) => {
        const res = {
          statusCode: 200,
          pipe: jest.fn().mockImplementation((stream) => {
            stream.emit('close');
            return stream;
          }),
          resume: jest.fn(),
        };
        callback(res);
        return { on: jest.fn() };
      });

      // Mock uploadImage to throw an error
      jest.spyOn(imagesController, 'uploadImage').mockRejectedValue(new Error('Upload failed'));

      await expect(service.migrateFile(airtableImage)).rejects.toThrow(
        'Failed uploading the image - Error: Upload failed'
      );
    });

    it('should upload the image and delete files successfully', async () => {
      const mockImage = {
        id: 1,
        uid: 'uid',
        cid: 'cid',
        width: 1920,
        height: 1080,
        url: 'https://example.com/image.webp',
        filename: 'sample-image.webp',
        size: 1000,
        type: 'image/webp',
        version: 'LARGE',
        thumbnails: [],
      };

      // Mock successful upload
      jest.spyOn(imagesController, 'uploadImage').mockResolvedValue({
        image: {
          id: 1,
          uid: 'uid',
          cid: 'cid',
          width: 1920,
          height: 1080,
          url: 'https://example.com/image.webp',
          filename: 'sample-image.webp',
          size: 1000,
          type: 'image/webp',
          version: ImageSize.LARGE,
          thumbnailToUid: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          thumbnails: [],
        },
      });
      const image = await service['migrateFile'](airtableImage); // Call the function

      // Mock file object that will be passed
      const mockFile = {
        path: 'test-path',
        filename: 'test-file.webp',
        size: 1000,
        buffer: Buffer.from('mockBuffer'),
        destination: '',
        fieldname: 'file',
        mimetype: 'image/webp',
        originalname: 'test-file.webp',
        stream: fs.createReadStream('test-path'),
        encoding: '7bit',
      };

      await service['migrateFile'](airtableImage);

      // Expect statement to ensure uploadImage was called with the correct arguments
      expect(imagesController.uploadImage).toHaveBeenCalledWith(mockFile, {
        needsToHashFilename: false,
      });

      // Expect the correct image is returned
      expect(image).toEqual(mockImage);

      // Ensure that fs.unlink is called to remove files
      expect(fs.unlink).toHaveBeenCalledTimes(2);
    });

    it('should throw an error if image upload fails', async () => {
      const errorMessage = 'Upload failed';

      // Mock upload failure
      jest.spyOn(imagesController, 'uploadImage').mockRejectedValue(new Error(errorMessage));

      // Expect the function to throw an error
      await expect(service['migrateFile'](airtableImage)).rejects.toThrow(
        `Failed uploading the image - Error: ${errorMessage}`
      );

      // Ensure fs.unlink is not called since the upload failed
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });
});

