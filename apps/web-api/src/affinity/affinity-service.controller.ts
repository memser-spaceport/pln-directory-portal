import { BadRequestException, Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { AffinityService } from './affinity.service';
import { IngestAffinityDto, IngestAffinityResponse } from './dto/ingest-affinity.dto';

const SCOPES = new Set(['full', 'founders', 'companies']);

@ApiTags('Affinity - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class AffinityServiceController {
  private readonly logger = new Logger(AffinityServiceController.name);

  constructor(private readonly affinityService: AffinityService) {}

  @Post('affinity/ingest')
  async ingest(@Body() dto: IngestAffinityDto): Promise<IngestAffinityResponse> {
    if (!dto.runId?.trim()) {
      throw new BadRequestException('runId is required');
    }
    if (!dto.scope || !SCOPES.has(dto.scope)) {
      throw new BadRequestException('scope must be full, founders, or companies');
    }

    const companies = dto.companies ?? [];
    const persons = dto.persons ?? [];

    if (dto.scope === 'companies' && companies.length === 0) {
      throw new BadRequestException('companies array is required for scope=companies');
    }
    if (dto.scope === 'founders' && persons.length === 0) {
      throw new BadRequestException('persons array is required for scope=founders');
    }
    if (dto.scope === 'full' && companies.length === 0 && persons.length === 0) {
      throw new BadRequestException('companies or persons required for scope=full');
    }

    for (let i = 0; i < companies.length; i++) {
      const c = companies[i];
      if (!c.affinity_org_id?.trim() || !c.name?.trim()) {
        throw new BadRequestException(`Company ${i}: affinity_org_id and name are required`);
      }
      if (!c.raw_fields || typeof c.raw_fields !== 'object') {
        throw new BadRequestException(`Company ${i}: raw_fields object is required`);
      }
    }

    for (let i = 0; i < persons.length; i++) {
      const p = persons[i];
      if (!p.affinity_person_id?.trim()) {
        throw new BadRequestException(`Person ${i}: affinity_person_id is required`);
      }
      if (!p.raw_fields || typeof p.raw_fields !== 'object') {
        throw new BadRequestException(`Person ${i}: raw_fields object is required`);
      }
    }

    this.logger.log(
      `Affinity ingest: runId=${dto.runId} scope=${dto.scope} companies=${companies.length} persons=${
        persons.length
      } dryRun=${dto.dryRun ?? false}`
    );

    return this.affinityService.ingest(dto);
  }
}
