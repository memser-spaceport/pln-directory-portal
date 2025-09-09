import {
  Controller,
  HttpException,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiParam } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import * as fs from 'fs';
import * as path from 'path';
import { apiImages } from '../../../../libs/contracts/src/lib/contract-images';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { hashFileName } from '../utils/hashing';
import { ImagesService } from './images.service';
import { IPFS } from '../../src/utils/constants';

const server = initNestServer(apiImages);
type RouteShape = typeof server.routeShapes;

/**
 * This controller is only used for testing purposes.
 * It is not used in the production app.
 */
@Controller()
export class ImagesController {
  constructor(
    private readonly imagesService: ImagesService,
    private readonly fileUploadService: FileUploadService
  ) {}

  @Api(server.route.getImages)
  findAll() {
    return this.imagesService.findAll();
  }

  @Api(server.route.getImage)
  @ApiParam({ name: 'uid', type: 'string' })
  findOne(@ApiDecorator() { params: { uid } }: RouteShape['getImage']) {
    return this.imagesService.findOne(uid);
  }

  @Api(server.route.uploadImage)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    { needsToHashFilename } = { needsToHashFilename: true }
  ) {
    const { mimetype, buffer } = file;

    if (
      mimetype !== 'image/jpeg' &&
      mimetype !== 'image/png' &&
      mimetype !== 'image/webp'
    ) {
      throw new HttpException('Invalid file type', HttpStatus.BAD_REQUEST);
    }

    // Hash filename if needed
    file.originalname = needsToHashFilename
      ? `${hashFileName(
          `${path.parse(file.originalname).name}-${Date.now()}`
        )}${path.parse(file.originalname).ext}`
      : file.originalname;

    const dir = './img-tmp';
    // Check if directory exists and create it if it doesn't
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    // Store the original file without processing
    const originalFilePath = path.join(dir, file.originalname);
    fs.writeFileSync(originalFilePath, buffer);

    // Create a file object for the original image
    const expressOriginalFile: Express.Multer.File = {
      path: originalFilePath,
      size: buffer.length,
      filename: file.originalname,
      buffer: buffer,
      destination: '',
      fieldname: 'file',
      mimetype: mimetype,
      originalname: file.originalname,
      stream: fs.createReadStream(originalFilePath),
      encoding: '7bit',
    };

    // Store the original file in web3.storage or s3 based on env config
    const resp = await this.fileUploadService.storeImageFiles([expressOriginalFile]);

    // Create the image record with basic metadata
    const createdImages = await this.imagesService.bulkCreate(
      {
        cid: resp,
        filename: file.originalname,
        size: buffer.length,
        height: 0, // No processing, so set to 0
        url: process.env.FILE_STORAGE === 'ipfs' ? await this.fileUploadService.getDecryptedFileUrl(
          resp,
          file.originalname
        ): resp,
        width: 0, // No processing, so set to 0
        version: 'ORIGINAL',
        type: mimetype.split('/')[1], // Extract format from mimetype
      },
      undefined // No thumbnails
    );
    return createdImages;
  }
}
