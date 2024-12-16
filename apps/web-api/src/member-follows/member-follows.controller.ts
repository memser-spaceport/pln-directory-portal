import { Controller, Param, Body, UsePipes, UseGuards, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { ZodValidationPipe } from 'nestjs-zod';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { apiMemberFollows } from 'libs/contracts/src/lib/contract-member-follow';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import {
  CreateMemberFollowDto,
  MemberFollowQueryParams,
  ResponseMemberFollowWithRelationsSchema
} from 'libs/contracts/src/schema';
import { MemberFollowsService } from './member-follows.service';
import { MembersService } from '../members/members.service';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';

const server = initNestServer(apiMemberFollows);
type RouteShape = typeof server.routeShapes;

@Controller('member-follows')
@UseGuards(UserTokenValidation)
export class MemberFollowsController {
  constructor(
    private readonly memberFollowService: MemberFollowsService,
    private readonly memberService: MembersService
  ) {}

  @Api(apiMemberFollows.createFollow)
  @UsePipes(ZodValidationPipe)
  async createFollow(
    @Body() body: CreateMemberFollowDto, 
    @Req() request
  ) {
    const member = await this.memberService.findMemberByEmail(request['userEmail']);
    body.memberUid = member.uid;
    return await this.memberFollowService.createFollow(body as any);
  }

  @Api(apiMemberFollows.deleteFollow)
  async deleteFollow(@Param('uid') uid: string) {
    return await this.memberFollowService.deleteFollowByUid(uid);
  }

  @Api(apiMemberFollows.getFollows)
  @ApiQueryFromZod(MemberFollowQueryParams)
  @ApiOkResponseFromZod(ResponseMemberFollowWithRelationsSchema.array())
  async getFollows(@Req() request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseMemberFollowWithRelationsSchema);
    const queryParams = request.query;
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(queryParams);
    return await this.memberFollowService.getFollows(builtQuery);
  }
}
