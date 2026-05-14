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
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(val).trim())) {
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
    }

    this.logger.log(
      `Received investor-outreach ingest: items=${dto.items.length} runId=${dto.runId ?? 'none'} source=${
        dto.source ?? 'none'
      }`
    );
    return this.investorOutreachService.ingest(dto);
  }
}
