import { Module } from '@nestjs/common';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { AwsService } from '../utils/aws/aws.service';
import { JwtService } from '../utils/jwt/jwt.service';
import { AdminImagesController } from './admin-images.controller';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { ServiceImagesController } from './service-images.controller';

@Module({
  controllers: [ImagesController, AdminImagesController, ServiceImagesController],
  providers: [ImagesService, FileUploadService, AwsService, JwtService],
  // MCP agents add images to forum posts through the same storage (LAB-3156)
  exports: [ImagesService],
})
export class ImagesModule {}
