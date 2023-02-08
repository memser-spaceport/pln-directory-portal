import { Controller, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiParam } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { apiImages } from '../../../../libs/contracts/src/lib/contract-images';
import { THUMBNAIL_SIZES } from '../utils/constants';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { hashFileName } from '../utils/hashing';
import { ImagesService } from './images.service';

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
    const originalImage = await sharp(file.buffer)
      .webp({ effort: 3 })
      .toFile(path.join('./img-tmp', file.originalname));

    /*
        The following conditions are meant to prevent generating thumbnails
        that are larger than the original image
    */
    if (originalImage.width > THUMBNAIL_SIZES.TINY) {
      const filename = `${THUMBNAIL_SIZES.TINY}-${file.originalname}`;

      const tinyImage = await generateThumbnail(file, THUMBNAIL_SIZES.TINY);

      const tinyFormData = createFormDataFromSharp(
        filename,
        path.join('./img-tmp', filename),
        tinyImage
      );
      filesToStore.push(tinyFormData);

      // Some of the properties will be filled below when the image is stored in web3.storage
      thumbnails.push({
        cid: '',
        size: tinyImage.size,
        filename: filename,
        height: tinyImage.height,
        width: tinyImage.width,
        type: tinyImage.format,
        url: '',
        version: 'TINY',
      });
    }

    if (originalImage.width > THUMBNAIL_SIZES.SMALL) {
      const filename = `${THUMBNAIL_SIZES.SMALL}-${file.originalname}`;
      const smallImage = await generateThumbnail(file, THUMBNAIL_SIZES.SMALL);

      const smallFormData = createFormDataFromSharp(
        filename,
        path.join('./img-tmp', filename),
        smallImage
      );
      filesToStore.push(smallFormData);

      thumbnails.push({
        cid: '',
        size: smallImage.size,
        filename: filename,
        height: smallImage.height,
        width: smallImage.width,
        url: '',
        type: smallImage.format,
        version: 'SMALL',
      });
    }

    if (originalImage.width > THUMBNAIL_SIZES.MEDIUM) {
      const filename = `${THUMBNAIL_SIZES.MEDIUM}-${file.originalname}`;
      const mediumImage = await generateThumbnail(file, THUMBNAIL_SIZES.MEDIUM);

      const mediumFormData = createFormDataFromSharp(
        filename,
        path.join('./img-tmp', filename),
        mediumImage
      );
      filesToStore.push(mediumFormData);

      thumbnails.push({
        cid: '',
        size: mediumImage.size,
        filename: filename,
        height: mediumImage.height,
        width: mediumImage.width,
        url: '',
        type: mediumImage.format,
        version: 'MEDIUM',
      });
    }

    if (originalImage.width > THUMBNAIL_SIZES.LARGE) {
      const filename = `${THUMBNAIL_SIZES.LARGE}-${file.originalname}`;
      const largeImage = await generateThumbnail(file, THUMBNAIL_SIZES.LARGE);

      const largeFormData = createFormDataFromSharp(
        filename,
        path.join('./img-tmp', filename),
        largeImage
      );
      filesToStore.push(largeFormData);
      thumbnails.push({
        cid: '',
        size: largeImage.size,
        filename: filename,
        height: largeImage.height,
        width: largeImage.width,
        url: '',
        type: largeImage.format,
        version: 'LARGE',
      });
    }

    // Store all files in web3.storage
    const cid = await this.fileUploadService.storeFiles([
      file,
      ...filesToStore,
    ]);
    // Update thumbnails with the cid and url of the image
    thumbnails.map(async (thumbnail) => {
      thumbnail.cid = cid;
      thumbnail.url = await this.fileUploadService.getDecryptedFileUrl(
        cid,
        thumbnail.filename
      );
    });

    const hasThumbnails = thumbnails.length > 0;
    const createdImages = await this.imagesService.bulkCreate(
      {
        cid: cid,
        filename: file.originalname,
        size: originalImage.size,
        height: originalImage.height,
        url: await this.fileUploadService.getDecryptedFileUrl(
          cid,
          file.originalname
        ),
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

// TODO: Move the two function top image.service.ts
function createFormDataFromSharp(
  filename: string,
  filePath: string,
  sharpInfo: sharp.OutputInfo
): Express.Multer.File {
  return {
    path: filePath,
    size: sharpInfo.size,
    filename: `${filename}`,
    buffer: fs.readFileSync(filePath),
    destination: '',
    fieldname: 'file',
    mimetype: 'image/webp',
    originalname: `${filename}`,
    stream: fs.createReadStream(filePath),
    encoding: '7bit',
  };
}

function generateThumbnail(
  file: Express.Multer.File,
  size: number
): Promise<sharp.OutputInfo> {
  return sharp(file.buffer)
    .resize(size)
    .webp({ effort: 3, force: true })
    .toFormat('webp')
    .toFile(path.join('./img-tmp', `${size}-${file.originalname}`));
}
