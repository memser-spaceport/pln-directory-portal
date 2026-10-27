import { Controller, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiImages } from '../../../../libs/contracts/src/lib/contract-images';
import { ANONYMOUS_IMAGE_UPLOAD_LIMIT, ANONYMOUS_IMAGE_UPLOAD_TTL_SECONDS } from './images.constants';
import { ImagesService } from './images.service';

const server = initNestServer(apiImages);
type RouteShape = typeof server.routeShapes;

/**
 * POST /v1/images stays open. Sign-up and onboarding upload before a member
 * account exists, and the directory uploads profile, team and rich-text images
 * here with no member token. The per-IP limit is the control on this route.
 * Back-office uses POST /v1/admin/images. The events service uses POST /v1/service/images.
 */
@Controller()
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

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
  @Throttle(ANONYMOUS_IMAGE_UPLOAD_LIMIT, ANONYMOUS_IMAGE_UPLOAD_TTL_SECONDS)
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(@UploadedFile() file: Express.Multer.File, { needsToHashFilename } = { needsToHashFilename: true }) {
    return this.imagesService.upload(file, { needsToHashFilename });
  }
}
