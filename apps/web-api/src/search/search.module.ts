import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { OpenSearchModule } from '../opensearch/opensearch.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';

@Module({
  imports: [OpenSearchModule, AccessControlV2Module],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
