import { Controller, Param, Body, UsePipes, UseGuards, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { ZodValidationPipe } from 'nestjs-zod';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { apiMemberSubscriptions } from 'libs/contracts/src/lib/contract-member-subscription';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import {
  CreateMemberSubscriptionDto,
  UpdateMemberSubscriptionDto,
  MemberSubscriptionQueryParams,
  ModifyMemberSubscriptionSchema,
  MySubscriptionsQueryParams,
  ResponseMemberSubscriptionSchema,
  ResponseMemberSubscriptionWithRelationsSchema
} from 'libs/contracts/src/schema';
import { MemberSubscriptionService } from './member-subscriptions.service';
import { MembersService } from '../members/members.service';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { NoCache } from '../decorators/no-cache.decorator';
import { isRequestAuthenticated, sanitizeMembersContactsForViewer } from '../members/member-contact-sanitizer';

const server = initNestServer(apiMemberSubscriptions);
type RouteShape = typeof server.routeShapes;

@Controller()
export class MemberSubscriptionController {
  constructor(
    private readonly memberFollowService: MemberSubscriptionService,
    private readonly memberService: MembersService
  ) {}

  @Api(apiMemberSubscriptions.createSubscription)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async createSubscription(
    @Body() body: CreateMemberSubscriptionDto, 
    @Req() request
  ) {
    const member = await this.memberService.findMemberByEmail(request['userEmail']);
    body.memberUid = member.uid;
    return await this.memberFollowService.subscribe(body as any);
  }

  /**
   * Returns the caller's own subscriptions, unfiltered by approval state, so that
   * a member can always read -- and therefore cancel -- what they subscribed to.
   *
   * `@NoCache()` is load-bearing: this is a per-viewer response on a controller
   * whose other reads are shared, and a cached copy would serve one member's
   * follow state to another.
   */
  @Api(apiMemberSubscriptions.getMySubscriptions)
  @ApiQueryFromZod(MySubscriptionsQueryParams.optional())
  @ApiOkResponseFromZod(ResponseMemberSubscriptionSchema.array())
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getMySubscriptions(@Req() request) {
    const member = await this.memberService.findMemberByEmail(request['userEmail']);
    const { entityUid, entityType, isActive } = MySubscriptionsQueryParams.parse(request.query ?? {});
    return await this.memberFollowService.getSubscriptionsForMember(member.uid, {
      where: {
        ...(entityUid ? { entityUid } : {}),
        ...(entityType ? { entityType } : {}),
        ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Api(apiMemberSubscriptions.modifySubscription)
  @UseGuards(UserTokenValidation)
  async modifySubscription(
    @Param('uid') uid: string,
    @Body() body: UpdateMemberSubscriptionDto,
    @Req() request
  ) {
    const member = await this.memberService.findMemberByEmail(request['userEmail']);
    /* This route has no ZodValidationPipe, so the body arrives unvalidated and
       used to be spread straight into Prisma. Parse it down to the one field a
       member may change. */
    const { isActive } = ModifyMemberSubscriptionSchema.parse(body ?? {});
    /* Scoped to the caller's own rows. Without this a member could PUT any
       subscription uid -- and, because `memberUid` used to be copied off the
       caller onto the row, reassign someone else's subscription to themselves. */
    return await this.memberFollowService.modifyOwnSubscription(uid, member.uid, { isActive });
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
    const subscriptions = await this.memberFollowService.getSubscriptions(builtQuery);
    return sanitizeMembersContactsForViewer(subscriptions ?? [], isRequestAuthenticated(request));
  }
}
