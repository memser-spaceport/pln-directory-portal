import { Controller, Query, UsePipes } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { TsRest } from '@ts-rest/nest';
import { apiSearch } from 'libs/contracts/src/lib/contract-search';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { ResponseSearchResultDto, SearchQueryDto } from 'libs/contracts/src/schema/global-search';

@ApiTags('Search')
@Controller()
export class SearchController {
  constructor(private searchService: SearchService) {}

  @TsRest(apiSearch.fullTextSearch)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getFullTextSearchResults(@Query() query: SearchQueryDto): Promise<ResponseSearchResultDto> {
    return this.searchService.fetchAllIndices(query.q);
  }

  @TsRest(apiSearch.autocompleteSearch)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getAutocompleteSearchResults(@Query() query: SearchQueryDto): Promise<ResponseSearchResultDto> {
    return this.searchService.autocompleteSearch(query.q);
  }
}
