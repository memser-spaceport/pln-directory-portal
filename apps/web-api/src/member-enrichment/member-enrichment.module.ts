import { Module } from '@nestjs/common';
import { HuskyModule } from '../husky/husky.module';
import { MemberEnrichmentService } from './member-enrichment.service';
import { MemberEnrichmentJob } from './member-enrichment.job';

@Module({
  imports: [HuskyModule],
  providers: [MemberEnrichmentService, MemberEnrichmentJob],
  exports: [MemberEnrichmentService, MemberEnrichmentJob],
})
export class MemberEnrichmentModule {}
