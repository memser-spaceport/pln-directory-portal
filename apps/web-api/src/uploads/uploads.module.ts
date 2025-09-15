import { forwardRef, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { PrismaService } from '../shared/prisma.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { AwsService } from '../utils/aws/aws.service';
import { FileEncryptionService } from '../utils/file-encryption/file-encryption.service';
import { MembersModule } from '../members/members.module'; // <-- must export MembersService

@Module({
  imports: [
    forwardRef(() => MembersModule),
    MulterModule.register({
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB example
    }),
  ],
  providers: [UploadsService, PrismaService, FileUploadService, AwsService, FileEncryptionService],
  controllers: [UploadsController],
  exports: [UploadsService],
})
export class UploadsModule {}
