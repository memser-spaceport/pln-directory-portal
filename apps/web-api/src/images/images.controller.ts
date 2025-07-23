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
// import sharp from 'sharp';
import { apiImages } from '../../../../libs/contracts/src/lib/contract-images';
// import { compressImage } from '../utils/compress-image';
import { THUMBNAIL_SIZES } from '../utils/constants';
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

    const thumbnails: Prisma.ImageCreateManyInput[] = [];
    const filesToStore: Express.Multer.File[] = [];

    // Generate original image to obtain width and height
    // const originalImage = await sharp(file.buffer)
    //   .webp({ effort: 3 })
    //   .toFile(path.join(dir, file.originalname));
    // Instead, just write the buffer to disk and use dummy metadata
    fs.writeFileSync(path.join(dir, file.originalname), file.buffer as any);
    const originalImage = {
      width: 1000, // placeholder
      height: 1000, // placeholder
      size: buffer.length,
      format: 'webp',
    };

    /**
     * Compress original image
     */
    const compressedFileName = `${path.parse(file.originalname).name}.webp`;
    // const compressedOriginalFile = await compressImage({
    //   buffer,
    //   sharpImage: originalImage,
    //   fileName: compressedFileName,
    //   dir,
    // });
    // const compressedOriginalFilePath = `${dir}/${compressedFileName}`;
    // Instead, just copy the original file as the compressed file
    const compressedOriginalFilePath = `${dir}/${compressedFileName}`;
    fs.copyFileSync(path.join(dir, file.originalname), compressedOriginalFilePath);
    const compressedOriginalFile = {
      size: buffer.length,
      format: 'webp',
    };
    /*
        The following conditions are meant to prevent generating thumbnails
        that are larger than the original image
    */
    if (originalImage.width > THUMBNAIL_SIZES.TINY) {
      const filename = `${THUMBNAIL_SIZES.TINY}-${compressedFileName}`;
      fs.copyFileSync(compressedOriginalFilePath, path.join(dir, filename));
      filesToStore.push({
        path: path.join(dir, filename),
        size: buffer.length,
        filename,
        buffer: fs.readFileSync(path.join(dir, filename)),
        destination: '',
        fieldname: 'file',
        mimetype: 'image/webp',
        originalname: filename,
        stream: fs.createReadStream(path.join(dir, filename)),
        encoding: '7bit',
      });
      thumbnails.push({
        cid: '',
        size: buffer.length,
        filename: filename,
        height: 100,
        width: 100,
        type: 'webp',
        url: '',
        version: 'TINY',
      });
    }

    if (originalImage.width > THUMBNAIL_SIZES.SMALL) {
      const filename = `${THUMBNAIL_SIZES.SMALL}-${compressedFileName}`;
      fs.copyFileSync(compressedOriginalFilePath, path.join(dir, filename));
      filesToStore.push({
        path: path.join(dir, filename),
        size: buffer.length,
        filename,
        buffer: fs.readFileSync(path.join(dir, filename)),
        destination: '',
        fieldname: 'file',
        mimetype: 'image/webp',
        originalname: filename,
        stream: fs.createReadStream(path.join(dir, filename)),
        encoding: '7bit',
      });
      thumbnails.push({
        cid: '',
        size: buffer.length,
        filename: filename,
        height: 200,
        width: 200,
        url: '',
        type: 'webp',
        version: 'SMALL',
      });
    }

    if (originalImage.width > THUMBNAIL_SIZES.MEDIUM) {
      const filename = `${THUMBNAIL_SIZES.MEDIUM}-${compressedFileName}`;
      fs.copyFileSync(compressedOriginalFilePath, path.join(dir, filename));
      filesToStore.push({
        path: path.join(dir, filename),
        size: buffer.length,
        filename,
        buffer: fs.readFileSync(path.join(dir, filename)),
        destination: '',
        fieldname: 'file',
        mimetype: 'image/webp',
        originalname: filename,
        stream: fs.createReadStream(path.join(dir, filename)),
        encoding: '7bit',
      });
      thumbnails.push({
        cid: '',
        size: buffer.length,
        filename: filename,
        height: 400,
        width: 400,
        url: '',
        type: 'webp',
        version: 'MEDIUM',
      });
    }

    if (originalImage.width > THUMBNAIL_SIZES.LARGE) {
      const filename = `${THUMBNAIL_SIZES.LARGE}-${compressedFileName}`;
      fs.copyFileSync(compressedOriginalFilePath, path.join(dir, filename));
      filesToStore.push({
        path: path.join(dir, filename),
        size: buffer.length,
        filename,
        buffer: fs.readFileSync(path.join(dir, filename)),
        destination: '',
        fieldname: 'file',
        mimetype: 'image/webp',
        originalname: filename,
        stream: fs.createReadStream(path.join(dir, filename)),
        encoding: '7bit',
      });
      thumbnails.push({
        cid: '',
        size: buffer.length,
        filename: filename,
        height: 800,
        width: 800,
        url: '',
        type: 'webp',
        version: 'LARGE',
      });
    }

    // Create a new file to store the compressed original image
    const expressCompressedOriginalFile: Express.Multer.File = {
      path: compressedOriginalFilePath,
      size: compressedOriginalFile.size,
      filename: compressedFileName,
      buffer: fs.readFileSync(compressedOriginalFilePath),
      destination: '',
      fieldname: 'file',
      mimetype: `image/${compressedOriginalFile.format}`,
      originalname: compressedFileName,
      stream: fs.createReadStream(compressedOriginalFilePath),
      encoding: '7bit',
    };

    // Store all files in web3.storage or s3 based on env config
    const resp = await this.fileUploadService.storeFiles([
      expressCompressedOriginalFile,
      ...filesToStore,
    ]);
    // Update thumbnails with the cid and url of the image
    thumbnails.map(async (thumbnail) => {
      thumbnail.cid = resp;
      if (process.env.FILE_STORAGE === IPFS) {
        thumbnail.url = await this.fileUploadService.getDecryptedFileUrl(
          resp,
          thumbnail.filename
        );
      } else {
        thumbnail.url = resp;
      }
    });

    const hasThumbnails = thumbnails.length > 0;
    const createdImages = await this.imagesService.bulkCreate(
      {
        cid: resp,
        filename: compressedFileName,
        size: originalImage.size,
        height: originalImage.height,
        url: process.env.FILE_STORAGE === 'ipfs' ? await this.fileUploadService.getDecryptedFileUrl(
          resp,
          compressedFileName
        ): resp,
        width: originalImage.width,
        version: 'ORIGINAL',
        type: originalImage.format,
      },
      hasThumbnails ? thumbnails : undefined
    );

    // Remove temporary folder
    fs.rmSync(dir, { recursive: true, force: true });

    return createdImages;
  }
}
