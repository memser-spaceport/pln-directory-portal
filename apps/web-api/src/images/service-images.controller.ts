import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { ImagesService } from './images.service';

/**
 * Events-service image upload. Authorization is Basic or Bearer
 * INTERNAL_SERVICE_SECRET (ServiceAuthGuard). The v1/service prefix is outside
 * the member rate limiter.
 */
@ApiTags('Images - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
@SkipThrottle()
export class ServiceImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('images')
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
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.imagesService.upload(file);
  }
}
