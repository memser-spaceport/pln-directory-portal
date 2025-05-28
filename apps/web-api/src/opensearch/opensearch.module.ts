import { Module } from '@nestjs/common';
import { OpenSearchService } from './opensearch.service';

@Module({
  providers: [OpenSearchService],
  exports: [OpenSearchService],
})
export class OpenSearchModule {}
