import { Body, Controller, Get, Post, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { SubscribeDemoDayDto, DemoDaySubscriptionStatusResponseDto } from 'libs/contracts/src/schema';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { MembersService } from '../members/members.service';
import { extractTokenFromRequest } from '../utils/auth';
import { Request } from 'express';

@ApiTags('Demo Day Subscriptions')
@Controller('v1/demo-day-subscriptions')
export class DemoDaySubscriptionsController {
  constructor(
    private readonly notificationServiceClient: NotificationServiceClient,
    private readonly membersService: MembersService
  ) {}

  @Post('subscribe')
  @UseGuards(UserTokenCheckGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async subscribeToDemoDay(@Body() body: SubscribeDemoDayDto, @Req() req: Request) {
    const token = extractTokenFromRequest(req);
    let memberId: string | undefined;

    if (token && req['userEmail']) {
      try {
        const member = await this.membersService.findMemberFromEmail(req['userEmail']);
        memberId = member.uid;
      } catch (error) {
        // Member not found, continue without memberId
      }
    }

    const subscriberData = {
      email: body.email,
      eventType: 'DEMO_DAY',
      name: body.name,
      memberId: memberId,
    };

    return await this.notificationServiceClient.createEventSubscriber(subscriberData);
  }

  @Get('subscription-status')
  @UseGuards(UserTokenCheckGuard)
  @NoCache()
  async getSubscriptionStatus(
    @Query('email') email: string,
    @Req() req: Request
  ): Promise<DemoDaySubscriptionStatusResponseDto> {
    const token = extractTokenFromRequest(req);
    let checkEmail = email;

    if (token && req['userEmail']) {
      checkEmail = req['userEmail'];
    }

    if (!checkEmail) {
      return { subscribed: false };
    }

    try {
      const subscriber = await this.notificationServiceClient.getEventSubscriberByEmailAndType(checkEmail, 'DEMO_DAY');
      return {
        subscribed: !!subscriber,
        email: checkEmail,
      };
    } catch (error) {
      return { subscribed: false, email: checkEmail };
    }
  }
}
