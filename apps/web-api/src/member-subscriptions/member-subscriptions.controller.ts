import { Controller, Param, Body, UsePipes, UseGuards, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { apiMemberSubscriptions } from 'libs/contracts/src/lib/contract-member-subscription';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import {
  CreateMemberSubscriptionDto,
  UpdateMemberSubscriptionDto,
  MemberSubscriptionQueryParams,
  ResponseMemberSubscriptionWithRelationsSchema,
  CreateMemberSubscriptionSchema,
  UpdateMemberSubscriptionSchema
} from 'libs/contracts/src/schema';
import { MemberSubscriptionService } from './member-subscriptions.service';
import { MembersService } from '../members/members.service';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';
import { NoCache } from '../decorators/no-cache.decorator';

const server = initNestServer(apiMemberSubscriptions);
type RouteShape = typeof server.routeShapes;

@ApiTags('Member Subscriptions')
@Controller()
export class MemberSubscriptionController {
  constructor(
    private readonly memberFollowService: MemberSubscriptionService,
    private readonly memberService: MembersService
  ) {}

  @Api(apiMemberSubscriptions.createSubscription)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  @ApiBodyFromZod(CreateMemberSubscriptionSchema)
  @ApiBearerAuth()
  async createSubscription(
    @Body() body: CreateMemberSubscriptionDto, 
    @Req() request
  ) {
    const member = await this.memberService.findMemberByEmail(request['userEmail']);
    body.memberUid = member.uid;
    return await this.memberFollowService.createSubscription(body as any);
  }

  @Api(apiMemberSubscriptions.modifySubscription)
  @UseGuards(UserTokenValidation)
  @ApiBodyFromZod(UpdateMemberSubscriptionSchema)
  @ApiBearerAuth()
  async modifySubscription(
    @Param('uid') uid: string,
    @Body() body: UpdateMemberSubscriptionDto,
    @Req() request
  ) {
    const member = await this.memberService.findMemberByEmail(request['userEmail']);
    body.memberUid = member.uid;
    return await this.memberFollowService.modifySubscription(uid, body as any);
  }

  @Api(apiMemberSubscriptions.getSubscriptions)
  @ApiQueryFromZod(MemberSubscriptionQueryParams)
  @ApiOkResponseFromZod(ResponseMemberSubscriptionWithRelationsSchema.array())
  @NoCache()
  async getSubscriptions(@Req() request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseMemberSubscriptionWithRelationsSchema);
    const queryParams = request.query;
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(queryParams);
    return await this.memberFollowService.getSubscriptions(builtQuery);
  }
}
