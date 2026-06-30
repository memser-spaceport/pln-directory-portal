import { Module } from '@nestjs/common';
import { DataEnrichmentClientService } from './data-enrichment-client.service';

@Module({
  providers: [DataEnrichmentClientService],
  exports: [DataEnrichmentClientService],
})
export class DataEnrichmentClientModule {}
