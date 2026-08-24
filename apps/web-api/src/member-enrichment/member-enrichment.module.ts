import { Module } from '@nestjs/common';
import { HuskyModule } from '../husky/husky.module';
import { CoresignalModule } from '../coresignal/coresignal.module';
import { MemberEnrichmentService } from './member-enrichment.service';
import { MemberEnrichmentAiService } from './member-enrichment-ai.service';
import { MemberEnrichmentJob } from './member-enrichment.job';

@Module({
  imports: [HuskyModule, CoresignalModule],
  providers: [MemberEnrichmentService, MemberEnrichmentAiService, MemberEnrichmentJob],
  exports: [MemberEnrichmentService, MemberEnrichmentAiService, MemberEnrichmentJob],
})
export class MemberEnrichmentModule {}
