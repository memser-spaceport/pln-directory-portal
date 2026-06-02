import { BadRequestException, Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import {
  IngestInvestorOutreachDto,
  IngestInvestorOutreachResponse,
  InvestorOutreachIngestItem,
} from './dto/ingest-investor-outreach.dto';
import { InvestorOutreachService } from './investor-outreach.service';

const REQUIRED_SCALAR: Array<keyof InvestorOutreachIngestItem> = [
  'investor_id',
  'dedupe_key',
  'source',
  'email',
  'email_status',
  'investor_type',
  'stage_focus',
  'engagement_tier',
  'enrichment_status',
];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

@ApiTags('Investor Outreach - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class InvestorOutreachServiceController {
  private readonly logger = new Logger(InvestorOutreachServiceController.name);

  constructor(private readonly investorOutreachService: InvestorOutreachService) {}

  @Post('investor-outreach/ingest')
  async ingest(@Body() dto: IngestInvestorOutreachDto): Promise<IngestInvestorOutreachResponse> {
    if (!dto.items || !Array.isArray(dto.items)) {
      throw new BadRequestException('items array is required');
    }
    if (dto.items.length === 0) {
      throw new BadRequestException('items array cannot be empty');
    }

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      for (const key of REQUIRED_SCALAR) {
        const v = item[key];
        if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
          throw new BadRequestException(`Item ${i}: ${key} is required`);
        }
      }

      const dateFields = [
        ['first_sent_date', item.first_sent_date],
        ['last_sent_date', item.last_sent_date],
        ['enrichment_date', item.enrichment_date],
      ] as const;
      for (const [name, val] of dateFields) {
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          if (!YMD.test(String(val).trim())) {
            throw new BadRequestException(`Item ${i}: ${name} must be YYYY-MM-DD when provided`);
          }
        }
      }
      if (item.last_enrichment_attempt != null && String(item.last_enrichment_attempt).trim() !== '') {
        const d = new Date(String(item.last_enrichment_attempt).trim());
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestException(`Item ${i}: last_enrichment_attempt must be valid ISO datetime when provided`);
        }
      }

      if (item.tags !== undefined && item.tags !== null) {
        if (!Array.isArray(item.tags)) {
          throw new BadRequestException(`Item ${i}: tags must be an array of strings when provided`);
        }
        for (const t of item.tags) {
          if (typeof t !== 'string') {
            throw new BadRequestException(`Item ${i}: tags entries must be strings`);
          }
        }
      }

      if (item.portfolio_overlaps !== undefined && item.portfolio_overlaps !== null) {
        if (!Array.isArray(item.portfolio_overlaps)) {
          throw new BadRequestException(`Item ${i}: portfolio_overlaps must be an array when provided`);
        }
        for (let j = 0; j < item.portfolio_overlaps.length; j++) {
          const o = item.portfolio_overlaps[j];
          if (!o || typeof o !== 'object') {
            throw new BadRequestException(`Item ${i}: portfolio_overlaps[${j}] must be an object`);
          }
          if (typeof o.team_uid !== 'string' || o.team_uid.trim() === '') {
            throw new BadRequestException(`Item ${i}: portfolio_overlaps[${j}].team_uid is required`);
          }
          if (o.deal_date != null && String(o.deal_date).trim() !== '' && !YMD.test(String(o.deal_date).trim())) {
            throw new BadRequestException(`Item ${i}: portfolio_overlaps[${j}].deal_date must be YYYY-MM-DD`);
          }
        }
      }
    }

    if (dto.portfolio_teams !== undefined && dto.portfolio_teams !== null) {
      if (!Array.isArray(dto.portfolio_teams)) {
        throw new BadRequestException('portfolio_teams must be an array when provided');
      }
      for (let i = 0; i < dto.portfolio_teams.length; i++) {
        const t = dto.portfolio_teams[i];
        if (!t || typeof t !== 'object') {
          throw new BadRequestException(`portfolio_teams[${i}] must be an object`);
        }
        if (typeof t.team_uid !== 'string' || t.team_uid.trim() === '') {
          throw new BadRequestException(`portfolio_teams[${i}].team_uid is required`);
        }
        if (
          t.pl_invested_at != null &&
          String(t.pl_invested_at).trim() !== '' &&
          !YMD.test(String(t.pl_invested_at).trim())
        ) {
          throw new BadRequestException(`portfolio_teams[${i}].pl_invested_at must be YYYY-MM-DD when provided`);
        }
        if (
          t.last_round_date != null &&
          String(t.last_round_date).trim() !== '' &&
          !YMD.test(String(t.last_round_date).trim())
        ) {
          throw new BadRequestException(`portfolio_teams[${i}].last_round_date must be YYYY-MM-DD when provided`);
        }
        if (
          t.raising_as_of != null &&
          String(t.raising_as_of).trim() !== '' &&
          !YMD.test(String(t.raising_as_of).trim())
        ) {
          throw new BadRequestException(`portfolio_teams[${i}].raising_as_of must be YYYY-MM-DD when provided`);
        }
      }
    }

    this.logger.log(
      `Received investor-outreach ingest: items=${dto.items.length} runId=${dto.runId ?? 'none'} source=${
        dto.source ?? 'none'
      } portfolio_teams=${dto.portfolio_teams?.length ?? 0}`
    );
    return this.investorOutreachService.ingest(dto);
  }
}
