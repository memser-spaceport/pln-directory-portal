import {
  BadRequestException,
  Controller,
  ForbiddenException,
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
  async getOne(@Param('uid') uid: string, @Req() request: Request) {
    const row: any = await this.uploads.getOne(uid);
    const member: any = await this.memberService.findMemberByEmail(request['userEmail']);
    const isAllowed = await this.isAuthorizedForUpload(row, member);
    if (!isAllowed) {
      throw new ForbiddenException('Not authorized to access this upload');
    }
    return row;
  }

  private async isAuthorizedForUpload(upload: any, member: any): Promise<boolean> {
    if (!member) return false;
    if (this.memberService.checkIfAdminUser(member)) return true;
    if (upload.uploaderUid && upload.uploaderUid === member.uid) return true;

    switch (upload.scopeType) {
      case 'MEMBER':
        return upload.scopeUid === member.uid;
      case 'TEAM': {
        if (!upload.scopeUid) return false;
        const isTeamMember = await this.prisma.teamMemberRole.count({
          where: { teamUid: upload.scopeUid, memberUid: member.uid },
        });
        return Boolean(isTeamMember);
      }
      case 'PROJECT': {
        if (!upload.scopeUid) return false;
        const project = await this.prisma.project.findUnique({
          where: { uid: upload.scopeUid },
          select: { createdBy: true },
        });
        if (project?.createdBy === member.uid) return true;
        const isContributor = await this.prisma.projectContribution.count({
          where: { projectUid: upload.scopeUid, memberUid: member.uid },
        });
        return Boolean(isContributor);
      }
      default:
        return false;
    }
  }
}
