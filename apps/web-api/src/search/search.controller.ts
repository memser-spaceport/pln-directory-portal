import { Controller, Get, Query, Req, UsePipes } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiSearch } from 'libs/contracts/src/lib/contract-search';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { ResponseSearchResultDto, SearchQueryDto } from 'libs/contracts/src/schema/global-search';

const server = initNestServer(apiSearch);

@ApiTags('Search')
@Controller()
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Api(server.route.fullTextSearch)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getFullTextSearchResults(@Query() query: SearchQueryDto): Promise<ResponseSearchResultDto> {
    return this.searchService.fetchAllIndices(query.q);
  }

  @Api(server.route.autocompleteSearch)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getAutocompleteSearchResults(@Query() query: SearchQueryDto): Promise<ResponseSearchResultDto> {
    return this.searchService.autocompleteSearch(query.q);
  }
}
