import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiMemberCvImports } from 'libs/contracts/src/lib/contract-member-cv-import';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { CV_IMPORT_MAX_BYTES } from './member-cv-imports.constants';
import { MemberCvImportsService } from './member-cv-imports.service';

const server = initNestServer(apiMemberCvImports);
type RouteShape = typeof server.routeShapes;

@Controller()
export class MemberCvImportsController {
  constructor(private readonly memberCvImportsService: MemberCvImportsService) {}

  @Post('/v1/members/:uid/cv-imports')
  @HttpCode(HttpStatus.ACCEPTED)
  @NoCache()
  @UseGuards(UserTokenValidation)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CV_IMPORT_MAX_BYTES } }))
  async upload(
    @Param('uid') uid: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { userEmail?: string }
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.memberCvImportsService.upload(uid, file, req.userEmail!);
  }

  @Api(server.route.getLatestMemberCvImport)
  @NoCache()
  @UseGuards(UserTokenValidation)
  async getLatest(
    @ApiDecorator() { params: { uid } }: RouteShape['getLatestMemberCvImport'],
    @Req() req: { userEmail?: string }
  ) {
    return this.memberCvImportsService.getLatest(uid, req.userEmail!);
  }

  @Api(server.route.applyMemberCvImport)
  @NoCache()
  @UseGuards(UserTokenValidation)
  async apply(
    @ApiDecorator() { params: { uid }, body }: RouteShape['applyMemberCvImport'],
    @Req() req: { userEmail?: string }
  ) {
    return this.memberCvImportsService.apply(uid, body, req.userEmail!);
  }
}
