import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { UploadKind, UploadScopeType } from '@prisma/client';
import { UploadsService } from './uploads.service';
import { PrismaService } from '../shared/prisma.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MembersService } from '../members/members.service';
import { Request } from 'express';

function parseEnum<T extends string>(val: string | undefined, allowed: readonly T[], fallback: T): T {
  if (!val) return fallback;
  const upper = val.toUpperCase() as T;
  return allowed.includes(upper) ? upper : fallback;
}

@Controller('v1/uploads')
@UseGuards(UserTokenValidation)
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly memberService: MembersService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
    @Query('kind') kindParam?: string,           // IMAGE | SLIDE | VIDEO | OTHER
    @Query('scopeType') scopeTypeParam?: string, // NONE | TEAM | MEMBER | PROJECT
    @Query('scopeUid') scopeUid?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const kind = parseEnum<UploadKind>(kindParam, ['IMAGE', 'SLIDE', 'VIDEO', 'OTHER'], 'OTHER');
    const scopeType = parseEnum<UploadScopeType>(scopeTypeParam, ['NONE', 'TEAM', 'MEMBER', 'PROJECT'], 'NONE');

    const member: any = await this.memberService.findMemberByEmail(request['userEmail']);
    const uploaderUid: string | null = member?.uid ?? null;

    if (scopeType === 'TEAM' && scopeUid) {
      if (!uploaderUid) throw new BadRequestException('Unauthorized to upload for TEAM');
      const isMember = await this.prisma.teamMemberRole.count({
        where: { teamUid: scopeUid, memberUid: uploaderUid },
      });
      if (!isMember) throw new BadRequestException('Not a team member');
    }

    const row = await this.uploads.uploadGeneric({
      file,
      kind,
      scopeType,
      scopeUid: scopeUid ?? null,
      uploaderUid,
    });

    return row;
  }

  @Get(':uid')
  @Header('Cache-Control', 'no-store')
  async getOne(
    @Param('uid') uid: string,
    @Query('disposition') disposition?: 'inline' | 'attachment',
    @Query('ttlSec') ttlSec?: string,
  ) {
    return this.uploads.getOneWithFreshUrl(uid, {
      disposition: disposition ?? 'inline',
      ttlSec: ttlSec ? Number(ttlSec) : 86400,
    });
  }
}
