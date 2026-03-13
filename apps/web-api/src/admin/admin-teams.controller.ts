import {
  BadRequestException,
  Body,
  CacheTTL,
  Controller,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { ZodValidationPipe } from '@abitia/zod-dto';

import { AdminTeamsService } from './admin-teams.service';
import { UploadTeamTiersQueryDto } from './schema/admin-teams';
import { TeamEnrichmentService } from '../team-enrichment/team-enrichment.service';

@ApiTags('Admin Teams')
@Controller('v1/admin/teams')
@UseGuards(AdminAuthGuard)
export class AdminTeamsController {
  constructor(
    private readonly adminTeamsService: AdminTeamsService,
    private readonly teamEnrichmentService: TeamEnrichmentService
  ) {}

  @Post('tiers/upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @NoCache()
  @CacheTTL(0)
  async uploadTiers(
    @UploadedFile() file: Express.Multer.File,
    @Query(new ZodValidationPipe()) query: UploadTeamTiersQueryDto,
    @Req() req: any
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required (multipart/form-data; field name: file)');
    }

    if (file.mimetype !== 'text/csv' && !file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are allowed');
    }

    return this.adminTeamsService.importTiersFromCsv({
      csvBuffer: file.buffer,
      dryRun: query.dryRun,
      matchBy: query.matchBy,
      requestorEmail: req?.userEmail ?? 'system',
      delimiter: query.delimiter,
      encoding: query.encoding,
    });
  }

  /**
   * Admin: full team update using old ParticipantsRequest payload.
   */
  @Patch('/:uid/full')
  @NoCache()
  async adminUpdateTeamFull(@Param('uid') teamUid: string, @Body() body) {
    return this.adminTeamsService.updateTeam(teamUid, body);
  }

  @Patch('/:uid/enrichment-review')
  @NoCache()
  async reviewEnrichment(
    @Param('uid') uid: string,
    @Body() body: { status: 'Reviewed' | 'Approved' },
    @Req() req: any
  ) {
    if (!body.status || !['Reviewed', 'Approved'].includes(body.status)) {
      throw new BadRequestException('status must be "Reviewed" or "Approved"');
    }
    await this.teamEnrichmentService.reviewEnrichment(uid, body.status, req?.userEmail ?? 'admin');
    return { success: true };
  }

  @Post('/:uid/trigger-enrichment')
  @NoCache()
  async triggerEnrichment(@Param('uid') uid: string) {
    const { status } = await this.teamEnrichmentService.enrichTeam(uid, 'manually');

    if (status === 'in_progress') {
      return { success: false, message: `Enrichment already in progress for team ${uid}` };
    }

    return { success: true, message: `Enrichment triggered for team ${uid}` };
  }

  @Post('trigger-enrichment')
  @NoCache()
  async triggerEnrichmentAll() {
    const result = await this.teamEnrichmentService.triggerEnrichmentForAllPending('manually');
    return { success: true, ...result, message: 'Enrichment triggered in background' };
  }
}
