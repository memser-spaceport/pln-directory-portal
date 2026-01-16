import {Body, Controller, Get, Post, UseGuards} from '@nestjs/common';
import {AdminAuthGuard} from '../../guards/admin-auth.guard';
import {IrlGatheringPushRuleKind} from '@prisma/client';
import {PrismaService} from '../../shared/prisma.service';
import {IrlGatheringPushNotificationsProcessor} from './irl-gathering-push-notifications.processor';
import {NoCache} from "../../decorators/no-cache.decorator";

class TriggerIrlPushDto {
  locationUid: string;
  kind: IrlGatheringPushRuleKind; // UPCOMING | REMINDER
}

@Controller('/v1/admin/irl-gathering-push-notifications')
@UseGuards(AdminAuthGuard)
export class IrlGatheringPushNotificationsController {
  constructor(
    private readonly processor: IrlGatheringPushNotificationsProcessor,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Returns list of IRL gathering locations for back-office dropdown.
   */
  @Get('locations')
  @NoCache()
  async locations() {
    const items = await this.prisma.pLEventLocation.findMany({
      where: {
        location: { not: '' },
      },
      select: { uid: true, location: true },
      orderBy: [{ location: 'asc' }],
    });

    return { items };
  }

  /**
   * Manual trigger from back-office:
   * - kind=UPCOMING => Announcement
   * - kind=REMINDER => Reminder
   */
  @Post('trigger')
  async trigger(@Body() body: TriggerIrlPushDto) {
    return await this.processor.triggerManual({locationUid: body.locationUid, kind: body.kind});
  }
}
