import { Module } from '@nestjs/common';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { AwsService } from '../utils/aws/aws.service';

@Module({
  controllers: [ImagesController],
  providers: [ImagesService, FileUploadService, AwsService],
})
export class ImagesModule {}
