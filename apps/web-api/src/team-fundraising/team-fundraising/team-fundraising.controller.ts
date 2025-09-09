import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { UpsertTeamFundraisingDto } from '../dto/upsert-team-fundraising.dto';
import { TeamFundraisingService } from './team-fundraising.service';
import { PrismaService } from '../../shared/prisma.service';
import { UserTokenValidation } from '../../guards/user-token-validation.guard';
import { UploadsService } from '../../uploads/uploads.service';
import { UploadKind, UploadScopeType } from '@prisma/client';

@Controller('v1/teams/:teamUid/fundraising-profile')
@UseGuards(UserTokenValidation)
export class TeamFundraisingController {
  constructor(
    private readonly service: TeamFundraisingService,
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * Resolve current member UID from request (auth guard must set userEmail).
   */
  private async memberUid(req: Request) {
    const email = (req as any)?.userEmail;
    const m = email ? await this.prisma.member.findUnique({where: {email}}) : null;
    if (!m) throw new Error('Unauthorized');
    return m.uid;
  }

  /**
   * GET profile for team (member-only). Includes joined uploads.
   */
  @Get()
  async getTeamProfile(@Req() req: Request, @Param('teamUid') teamUid: string) {
    const memberUid = await this.memberUid(req);
    return this.service.getForTeamAsMember(teamUid, memberUid);
  }

  /**
   * PUT upsert profile for team (member-only).
   * Accepts either Upload UIDs in JSON (onePagerUploadUid / videoUploadUid)
   * OR multipart files with names: onePagerFile, videoFile.
   * If files are provided, they are uploaded and their UIDs are attached to the DTO.
   */
  @Put()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'onePagerFile', maxCount: 1 },
      { name: 'videoFile', maxCount: 1 },
    ]),
  )
  async upsertTeamProfile(
    @Req() req: Request,
    @Param('teamUid') teamUid: string,
    @Body() body: UpsertTeamFundraisingDto,
    @UploadedFiles()
    files?: {
      onePagerFile?: Express.Multer.File[];
      videoFile?: Express.Multer.File[];
    },
  ) {
    const memberUid = await this.memberUid(req);

    // If multipart files are present, create Uploads and inject their UIDs into the payload.
    if (files?.onePagerFile?.[0]) {
      const up = await this.uploads.uploadGeneric({
        file: files.onePagerFile[0],
        kind: UploadKind.SLIDE,
        scopeType: UploadScopeType.TEAM,
        scopeUid: teamUid,
        uploaderUid: memberUid,
      });
      body.onePagerUploadUid = up.uid;
    }

    if (files?.videoFile?.[0]) {
      const up = await this.uploads.uploadGeneric({
        file: files.videoFile[0],
        kind: UploadKind.VIDEO,
        scopeType: UploadScopeType.TEAM,
        scopeUid: teamUid,
        uploaderUid: memberUid,
      });
      body.videoUploadUid = up.uid;
    }

    // If client sent Upload UIDs, ensure they exist and belong to the same team scope.
    // (Strong validation is in service as well; doing a quick check here provides early feedback.)
    for (const [field, allowedKinds] of [
      ['onePagerUploadUid', [UploadKind.SLIDE, UploadKind.IMAGE, UploadKind.OTHER] as UploadKind[]],
      ['videoUploadUid', [UploadKind.VIDEO] as UploadKind[]],
    ] as const) {
      const uid = (body as any)[field] as string | undefined | null;
      if (!uid) continue;

      const row = await this.prisma.upload.findUnique({ where: { uid } });
      if (!row) throw new BadRequestException(`Upload not found: ${field}`);
      if (!allowedKinds.includes(row.kind)) {
        throw new BadRequestException(
          `${field} must be one of: ${allowedKinds.join(', ')}, got ${row.kind}`,
        );
      }
      if (row.scopeType !== 'TEAM' || row.scopeUid !== teamUid) {
        throw new BadRequestException(`${field} must belong to team scope ${teamUid}`);
      }
    }

    return this.service.upsertForTeamAsMember(teamUid, memberUid, body);
  }
}
