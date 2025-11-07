import {
  BadRequestException,
  CacheTTL,
  Controller, Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ApiBody, ApiConsumes, ApiTags} from '@nestjs/swagger';
import {AdminAuthGuard} from '../guards/admin-auth.guard';
import {NoCache} from '../decorators/no-cache.decorator';
import {ZodValidationPipe} from '@abitia/zod-dto';

import {AdminTeamsService} from './admin-teams.service';
import {UploadTeamTiersQueryDto} from './schema/admin-teams';

@ApiTags('Admin Teams')
@Controller('v1/admin/teams')
@UseGuards(AdminAuthGuard)
export class AdminTeamsController {
  constructor(private readonly adminTeamsService: AdminTeamsService) {}

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
    @Req() req: any,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'CSV file is required (multipart/form-data; field name: file)',
      );
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
}
