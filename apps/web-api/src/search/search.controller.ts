import { Controller, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { TsRest } from '@ts-rest/nest';
import { apiSearch } from 'libs/contracts/src/lib/contract-search';
import { ApiTags } from '@nestjs/swagger';
import { isEmailQuery, SearchService } from './search.service';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { ResponseSearchResultDto, SearchQueryDto } from 'libs/contracts/src/schema/global-search';
import { OptionalUserTokenCheckGuard } from '../guards/user-token-check.guard';
import { isRequestAuthenticated } from '../members/member-contact-sanitizer';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { FORUM_PERMISSIONS, MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { Request } from 'express';

@ApiTags('Search')
@Controller()
@UseGuards(OptionalUserTokenCheckGuard)
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly accessControlV2Service: AccessControlV2Service
  ) {}

  private async hasPermission(req: Request, permission: string): Promise<boolean> {
    const userEmail = (req as Request & { userEmail?: string }).userEmail;
    if (!userEmail) {
      return false;
    }

    try {
      const { allowed } = await this.accessControlV2Service.hasPermissionByEmail(userEmail, permission);
      return allowed;
    } catch {
      return false;
    }
  }

  private hasForumReadPermission(req: Request): Promise<boolean> {
    return this.hasPermission(req, FORUM_PERMISSIONS.READ);
  }

  @TsRest(apiSearch.fullTextSearch)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getFullTextSearchResults(
    @Req() req: Request,
    @Query() query: SearchQueryDto
  ): Promise<ResponseSearchResultDto> {
    const canReadForum = await this.hasForumReadPermission(req);
    // Email lookup needs member.contacts.read (L2 and higher); logged-out, L0 and L1 callers get no email match.
    const canReadContacts = isEmailQuery(query.q)
      ? await this.hasPermission(req, MEMBER_PERMISSIONS.CONTACTS_READ)
      : false;
    return this.searchService.fetchAllIndices(query.q, {
      strict: query.strict,
      canReadForum,
      isAuthenticated: isRequestAuthenticated(req as any),
      canReadContacts,
    });
  }

  @TsRest(apiSearch.autocompleteSearch)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getAutocompleteSearchResults(
    @Req() req: Request,
    @Query() query: SearchQueryDto
  ): Promise<ResponseSearchResultDto> {
    const canReadForum = await this.hasForumReadPermission(req);
    return this.searchService.autocompleteSearch(query.q, 5, canReadForum, isRequestAuthenticated(req as any));
  }
}
