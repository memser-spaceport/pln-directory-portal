import { Controller, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { TsRest } from '@ts-rest/nest';
import { apiSearch } from 'libs/contracts/src/lib/contract-search';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { ResponseSearchResultDto, SearchQueryDto } from 'libs/contracts/src/schema/global-search';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { FORUM_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { Request } from 'express';

@ApiTags('Search')
@Controller()
@UseGuards(UserTokenCheckGuard)
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly accessControlV2Service: AccessControlV2Service
  ) {}

  private async hasForumReadPermission(req: Request): Promise<boolean> {
    const userEmail = (req as Request & { userEmail?: string }).userEmail;
    if (!userEmail) {
      return false;
    }

    try {
      const { allowed } = await this.accessControlV2Service.hasPermissionByEmail(userEmail, FORUM_PERMISSIONS.READ);
      return allowed;
    } catch {
      return false;
    }
  }

  @TsRest(apiSearch.fullTextSearch)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getFullTextSearchResults(
    @Req() req: Request,
    @Query() query: SearchQueryDto
  ): Promise<ResponseSearchResultDto> {
    const canReadForum = await this.hasForumReadPermission(req);
    return this.searchService.fetchAllIndices(query.q, { strict: query.strict, canReadForum });
  }

  @TsRest(apiSearch.autocompleteSearch)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getAutocompleteSearchResults(
    @Req() req: Request,
    @Query() query: SearchQueryDto
  ): Promise<ResponseSearchResultDto> {
    const canReadForum = await this.hasForumReadPermission(req);
    return this.searchService.autocompleteSearch(query.q, 5, canReadForum);
  }
}
