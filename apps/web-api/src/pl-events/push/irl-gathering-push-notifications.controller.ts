import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../guards/admin-auth.guard';
import { IrlGatheringPushRuleKind } from '@prisma/client';
import { IrlGatheringPushNotificationsProcessor } from './irl-gathering-push-notifications.processor';

class TriggerIrlPushDto {
  locationUid: string;
  kind: IrlGatheringPushRuleKind; // UPCOMING | REMINDER
}

@Controller('/v1/admin/irl-gathering-push-notifications')
@UseGuards(AdminAuthGuard)
export class IrlGatheringPushNotificationsController {
  constructor(private readonly processor: IrlGatheringPushNotificationsProcessor) {}

  @Post('trigger')
  async trigger(@Body() body: TriggerIrlPushDto) {
    await this.processor.triggerManual({ locationUid: body.locationUid, kind: body.kind });
    return { ok: true };
  }
}
