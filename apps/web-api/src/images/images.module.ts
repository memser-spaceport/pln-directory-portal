import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

@Module({
  controllers: [ImagesController],
  providers: [ImagesService, PrismaService, FileUploadService],
})
export class ImagesModule {}
