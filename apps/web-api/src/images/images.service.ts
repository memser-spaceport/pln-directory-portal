import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../shared/prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { hashFileName } from '../utils/hashing';

@Injectable()
export class ImagesService {
  constructor(private prisma: PrismaService, private readonly fileUploadService: FileUploadService) {}

  findAll() {
    return this.prisma.image.findMany();
  }

  findOne(uid: string, queryOptions: Omit<Prisma.ImageFindUniqueArgsBase, 'where'> = {}) {
    return this.prisma.image.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async bulkCreate(originalData: Prisma.ImageCreateInput, thumbnails?: Prisma.ImageCreateManyInput[]) {
    const image = await this.prisma.image.create({
      data: {
        ...originalData,
        thumbnails: {
          createMany: {
            data: thumbnails ? thumbnails : [],
          },
        },
      },
      include: {
        thumbnails: true,
      },
    });

    return { image };
  }

  async upload(file: Express.Multer.File, { needsToHashFilename } = { needsToHashFilename: true }) {
    const { mimetype, buffer } = file;

    if (
      mimetype !== 'image/jpeg' &&
      mimetype !== 'image/png' &&
      mimetype !== 'image/webp' &&
      mimetype !== 'image/gif'
    ) {
      throw new HttpException('Invalid file type', HttpStatus.BAD_REQUEST);
    }

    file.originalname = needsToHashFilename
      ? `${hashFileName(`${path.parse(file.originalname).name}-${Date.now()}`)}${path.parse(file.originalname).ext}`
      : file.originalname;

    const dir = './img-tmp';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    const originalFilePath = path.join(dir, file.originalname);
    fs.writeFileSync(originalFilePath, buffer);

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

    const resp = await this.fileUploadService.storeImageFiles([expressOriginalFile]);

    return this.bulkCreate(
      {
        cid: resp,
        filename: file.originalname,
        size: buffer.length,
        height: 0,
        url: resp,
        width: 0,
        version: 'ORIGINAL',
        type: mimetype.split('/')[1],
      },
      undefined
    );
  }
}
