import { Body, Controller, NotFoundException, Req, UseGuards, UsePipes, Param, ForbiddenException } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { NoCache } from '../decorators/no-cache.decorator';
import { apiMemberInteractions } from '../../../../libs/contracts/src/lib/contract-member-interaction';
import { MembersService } from '../members/members.service';
import { ZodValidationPipe } from 'nestjs-zod';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import {
   CreateMemberInteractionSchemaDto,
   CreateMemberFeedbackSchemaDto,
   MemberFollowUpQueryParams,
   ResponseMemberFollowUpWithRelationsSchema,
   MemberFollowUpStatus
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { OfficeHoursService } from './office-hours.service';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';

const server = initNestServer(apiMemberInteractions);

@Controller()
@NoCache()
export class OfficeHoursController {
  constructor(
    private readonly memberService: MembersService,
    private readonly interactionService: OfficeHoursService,
    private readonly followUpService: MemberFollowUpsService
  ) {}

  @Api(server.route.createMemberInteraction)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async createMemberInteraction(
    @Body() body: CreateMemberInteractionSchemaDto,
    @Req() request: Request
  ): Promise<any> {
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const interval = parseInt(process.env.INTERACTION_INTERVAL_DELAY_IN_MILLISECONDS || '1800000')
    const result = await this.interactionService.findInteractions({
      where: {
        sourceMemberUid: member?.uid,
        targetMemberUid: body?.targetMemberUid,
        createdAt: {
          gte: new Date(new Date().getTime() - interval)
        }
      }
    });
    if (result && result.length > 0) {
      throw new ForbiddenException(`Interaction with same user within ${interval / (60 * 1000)} minutes is forbidden`);
    }
    if (member.uid === body.targetMemberUid) {
      throw new ForbiddenException('Interacte with yourself is forbidden');
    }
    return await this.interactionService.createInteraction(body as any, member);
  }

  @Api(server.route.getMemberInteractionFollowUps)
  @ApiQueryFromZod(MemberFollowUpQueryParams)
  @ApiOkResponseFromZod(ResponseMemberFollowUpWithRelationsSchema.array())
  @UseGuards(UserTokenValidation)
  @NoCache()
  async findAll(
    @Req() request: Request
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseMemberFollowUpWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    builtQuery.where = {
      AND: [
        builtQuery.where,
        {
          createdBy: member?.uid,
          status: MemberFollowUpStatus.Enum.PENDING
        },
        this.followUpService.buildDelayedFollowUpQuery()
      ]
    }
    return this.followUpService.getFollowUps(builtQuery);
  }

  @Api(server.route.createMemberInteractionFeedback)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async createMemberInteractionFeedback(
    @Param('uid') interactionFollowUpUid: string,
    @Body() body: CreateMemberFeedbackSchemaDto,
    @Req() request: Request
  ): Promise<any> {
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const followUps = await this.followUpService.getFollowUps({
      where: {
        uid : interactionFollowUpUid,
        createdBy: member?.uid,
        status:  MemberFollowUpStatus.Enum.PENDING
      }
    });
    if (followUps && followUps.length === 0) {
      throw new NotFoundException(`There is no follow-up associated with the given ID: ${interactionFollowUpUid}`);
    }
    return await this.interactionService.createInteractionFeedback(body as any, member, followUps?.[0]);
  }
}